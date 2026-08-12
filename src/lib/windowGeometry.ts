/**
 * Pure decision layer for window geometry (iter2-ext N-03 / N-04 / N-05).
 *
 * This module deliberately contains **zero Tauri I/O** so every geometry
 * decision (dirty-data rejection, unit validation, clamping, the startup
 * silence window and the close-time write guard) can be unit-tested under
 * vitest's `environment: "node"`. The I/O side — reading the store, probing
 * the monitor, calling `setSize` — lives in `lib/tauri.ts` and does nothing
 * but feed numbers through the functions below.
 *
 * Root causes this layer exists to fix (see `docs/design-iter2-ext.md` §3.1):
 *   • RC-1 the persisted record used to be PhysicalSize but was restored as
 *     LogicalSize, so on a non-100% display the window grew by the scale
 *     factor on every launch. Records now carry `schema` + `unit` markers and
 *     anything without them is discarded wholesale.
 *   • RC-2 the two-step `restore + fit` startup wrote the clamped size back
 *     through `onResized`. A module-level readiness gate now silences
 *     persistence until the single atomic apply has finished.
 *   • RC-4 `MIN_W/MIN_H` in `lib/tauri.ts` drifted away from `tauri.conf.json`.
 *     `WINDOW_MIN` below is the single source of truth and a drift test pins
 *     it against the Tauri config.
 */
import type { WindowGeometry } from "../types";

// ---------------------------------------------------------------------------
// Constants — single source of truth
// ---------------------------------------------------------------------------

/**
 * Minimum window size in **logical** pixels.
 *
 * ⚠️ Single source of truth: `src-tauri/tauri.conf.json` must declare exactly
 * `minWidth: 960` / `minHeight: 480`. `windowGeometry.test.ts` reads the config
 * file and asserts equality so the two can never drift apart again (RC-4).
 *
 * The height was lowered 560 → 480 per design Q3: a 1366×768 panel at 150%
 * scaling only exposes ~911×470 logical pixels of work area, which makes a
 * 560 minimum physically unsatisfiable and forces the window off-screen.
 */
export const WINDOW_MIN = { width: 960, height: 480 } as const;

/** Fallback size used when there is no usable persisted record. */
export const WINDOW_DEFAULT = { width: 1400, height: 900 } as const;

/** Breathing room kept between the window and the work-area edges (logical px). */
export const WINDOW_MARGIN = 32;

/**
 * A persisted record larger than `work * this` is treated as historical dirty
 * data (a PhysicalSize value written by a pre-iter2-ext build) and discarded
 * instead of being clamped, so an inflated value never becomes the new normal.
 */
export const DIRTY_OVERSIZE_FACTOR = 1.5;

/** Tolerance (logical px) for "the user never touched the window" detection. */
export const CLOSE_WRITE_TOLERANCE = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Monitor work area in **logical** pixels. */
export interface WorkArea {
  width: number;
  height: number;
}

/** Why `computeStartupGeometry` produced the size it produced. */
export type GeometrySource =
  | "default"
  | "remembered"
  | "clamped"
  | "raised"
  | "maximized";

/** The single geometry plan applied at startup. */
export interface StartupGeometry {
  /** Logical width to apply. */
  width: number;
  /** Logical height to apply. */
  height: number;
  /** Whether to maximize after sizing. */
  maximize: boolean;
  /** Provenance of the numbers above (drives the close-time write guard). */
  source: GeometrySource;
}

/** Plain logical size pair, used by the close-time comparison. */
export interface LogicalSizeLike {
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** True when `n` is a finite, strictly positive number. */
function isPositiveFinite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * Type guard for a persisted `window-state` record.
 *
 * Both discriminators are mandatory: a record missing `schema: 2` or
 * `unit: 'logical'` predates the iter2-ext fix, so its unit is unknown (very
 * likely physical pixels) and it must not be reinterpreted — see RC-1.
 */
export function isValidGeometry(v: unknown): v is WindowGeometry {
  if (typeof v !== "object" || v === null) return false;
  const g = v as Record<string, unknown>;
  if (g.schema !== 2) return false;
  if (g.unit !== "logical") return false;
  if (!isPositiveFinite(g.width) || !isPositiveFinite(g.height)) return false;
  if (typeof g.maximized !== "boolean") return false;
  return true;
}

// ---------------------------------------------------------------------------
// Clamping
// ---------------------------------------------------------------------------

/**
 * Clamp one axis into `[min, work - WINDOW_MARGIN]`.
 *
 * Small-screen fallback: when the available space is *smaller* than `min`, the
 * minimum is lowered to the available space. Overflowing the monitor (which
 * pushes the custom drag region off-screen and makes the window ungrabbable)
 * is strictly worse than rendering below the declared minimum.
 */
export function clampAxis(value: number, min: number, work: number): number {
  const available = Math.max(1, Math.round(work - WINDOW_MARGIN));
  const lower = Math.min(min, available);
  const raw = isPositiveFinite(value) ? value : lower;
  return Math.round(Math.min(Math.max(raw, lower), available));
}

/** Effective lower bound for an axis after the small-screen fallback. */
function effectiveMin(min: number, work: number): number {
  return Math.min(min, Math.max(1, Math.round(work - WINDOW_MARGIN)));
}

/** Effective upper bound for an axis. */
function effectiveMax(work: number): number {
  return Math.max(1, Math.round(work - WINDOW_MARGIN));
}

/** Normalize a possibly-degenerate work area into usable positive numbers. */
function normalizeWork(work: WorkArea | null | undefined): WorkArea {
  const width = isPositiveFinite(work?.width)
    ? (work as WorkArea).width
    : WINDOW_DEFAULT.width + WINDOW_MARGIN;
  const height = isPositiveFinite(work?.height)
    ? (work as WorkArea).height
    : WINDOW_DEFAULT.height + WINDOW_MARGIN;
  return { width, height };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a raw `window-state` value into a trustworthy geometry record.
 *
 * @param raw  Whatever came out of the settings store.
 * @param work Optional work area (logical px). When supplied, the record is
 *             additionally clamped to fit the screen and raised to
 *             `WINDOW_MIN` (subject to the small-screen fallback).
 * @returns The record, or `null` when it is missing / malformed / unmarked.
 *          `null` is the self-heal path for users upgrading from a build that
 *          persisted PhysicalSize: the stale value is dropped, not rescaled.
 */
export function parsePersistedGeometry(
  raw: unknown,
  work?: WorkArea | null,
): WindowGeometry | null {
  if (!isValidGeometry(raw)) return null;
  if (!work) {
    return {
      schema: 2,
      unit: "logical",
      width: Math.round(raw.width),
      height: Math.round(raw.height),
      maximized: raw.maximized,
    };
  }
  const w = normalizeWork(work);
  return {
    schema: 2,
    unit: "logical",
    width: clampAxis(raw.width, WINDOW_MIN.width, w.width),
    height: clampAxis(raw.height, WINDOW_MIN.height, w.height),
    maximized: raw.maximized,
  };
}

// ---------------------------------------------------------------------------
// Startup decision
// ---------------------------------------------------------------------------

/**
 * Decide the one and only geometry to apply at startup.
 *
 * Implements the decision table in `docs/design-iter2-ext.md` §3.1, evaluated
 * strictly top to bottom:
 *
 * | input                                | source        | size                        |
 * | ------------------------------------ | ------------- | --------------------------- |
 * | no record / unmarked / not an object | `'default'`   | clamp(1400×900)             |
 * | valid && `maximized === true`        | `'maximized'` | clamped (kept for restore)  |
 * | valid && size > work × 1.5           | `'default'`   | clamp(1400×900) + warn      |
 * | valid && size > work − MARGIN        | `'clamped'`   | clamp to work − MARGIN      |
 * | valid && size < WINDOW_MIN           | `'raised'`    | raised to WINDOW_MIN        |
 * | valid && inside the band             | `'remembered'`| verbatim                    |
 *
 * @param remembered Raw persisted value (unvalidated on purpose).
 * @param work       Monitor work area in logical pixels.
 */
export function computeStartupGeometry(
  remembered: unknown,
  work: WorkArea,
): StartupGeometry {
  const area = normalizeWork(work);

  const fallback = (): StartupGeometry => ({
    width: clampAxis(WINDOW_DEFAULT.width, WINDOW_MIN.width, area.width),
    height: clampAxis(WINDOW_DEFAULT.height, WINDOW_MIN.height, area.height),
    maximize: false,
    source: "default",
  });

  // Row 1 — nothing usable (includes every pre-iter2-ext record).
  const record = parsePersistedGeometry(remembered);
  if (!record) return fallback();

  const width = clampAxis(record.width, WINDOW_MIN.width, area.width);
  const height = clampAxis(record.height, WINDOW_MIN.height, area.height);

  // Row 2 — maximized wins; the size is still computed so that un-maximizing
  // returns the user to their pre-maximize rectangle.
  if (record.maximized) {
    return { width, height, maximize: true, source: "maximized" };
  }

  // Row 3 — absurdly large record: an inflated legacy value that happens to
  // carry the markers. Discard rather than clamp, so it cannot become sticky.
  if (
    record.width > area.width * DIRTY_OVERSIZE_FACTOR ||
    record.height > area.height * DIRTY_OVERSIZE_FACTOR
  ) {
    console.warn(
      `[windowGeometry] discarding oversized window-state ${record.width}x${record.height} ` +
        `(work area ${Math.round(area.width)}x${Math.round(area.height)})`,
    );
    return fallback();
  }

  const maxW = effectiveMax(area.width);
  const maxH = effectiveMax(area.height);
  const minW = effectiveMin(WINDOW_MIN.width, area.width);
  const minH = effectiveMin(WINDOW_MIN.height, area.height);

  // Row 4 — does not fit on this monitor. Takes priority over row 5 because the
  // close-time write guard keys off `'clamped'` to protect the original record.
  if (record.width > maxW || record.height > maxH) {
    return { width, height, maximize: false, source: "clamped" };
  }

  // Row 5 — below the minimum (or below the small-screen fallback bound).
  if (record.width < minW || record.height < minH) {
    return { width, height, maximize: false, source: "raised" };
  }

  // Row 6 — honour the user's size verbatim.
  return { width, height, maximize: false, source: "remembered" };
}

// ---------------------------------------------------------------------------
// Startup silence window + close-time write guard
// ---------------------------------------------------------------------------

/**
 * Module-level gate shared by `applyStartupGeometry` and `persistWindowState`.
 *
 * It lives in the pure layer (rather than in `lib/tauri.ts`) purely so it is
 * reachable from node-environment tests; it holds numbers and booleans only.
 */
let geometryReady = false;
let clampedAtStartup = false;
let startupSize: LogicalSizeLike | null = null;

/** Open the silence window: persistence is refused until the apply finishes. */
export function resetGeometryGate(): void {
  geometryReady = false;
  clampedAtStartup = false;
  startupSize = null;
}

/**
 * Close the silence window.
 *
 * Called from `applyStartupGeometry`'s `finally` block so the gate opens even
 * when the Tauri calls threw — a failed geometry apply must never permanently
 * disable size persistence.
 *
 * @param applied The plan that was actually applied, or `null` if it failed.
 */
export function markGeometryReady(applied: StartupGeometry | null): void {
  clampedAtStartup = applied?.source === "clamped";
  startupSize = applied ? { width: applied.width, height: applied.height } : null;
  geometryReady = true;
}

/** Whether the atomic startup apply has completed. */
export function isGeometryReady(): boolean {
  return geometryReady;
}

/**
 * Guard for `persistWindowState`. Returns `false` during the startup silence
 * window, which is what stops the programmatic `setSize` + `center` from
 * echoing back into the store through `onResized` (RC-2).
 */
export function shouldPersist(): boolean {
  return geometryReady;
}

/** True when the startup apply had to shrink the remembered size. */
export function wasClampedAtStartup(): boolean {
  return clampedAtStartup;
}

/** The size applied at startup, or `null` if the apply never completed. */
export function getStartupSize(): LogicalSizeLike | null {
  return startupSize ? { ...startupSize } : null;
}

/**
 * Guard for the close handler.
 *
 * When the window was shrunk at startup to fit a smaller monitor **and** the
 * user never resized it (current size still matches the clamped size within
 * `CLOSE_WRITE_TOLERANCE`), writing on close would overwrite the user's real
 * preference with the clamped value. Skipping the write lets the original size
 * come back when they return to the larger display.
 *
 * @param current Current window size in logical pixels.
 */
export function shouldPersistOnClose(current: LogicalSizeLike): boolean {
  if (!geometryReady) return false;
  if (!clampedAtStartup || !startupSize) return true;
  const dw = Math.abs(current.width - startupSize.width);
  const dh = Math.abs(current.height - startupSize.height);
  const untouched =
    dw <= CLOSE_WRITE_TOLERANCE && dh <= CLOSE_WRITE_TOLERANCE;
  return !untouched;
}
