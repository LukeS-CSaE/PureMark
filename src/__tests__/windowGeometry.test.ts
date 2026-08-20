/**
 * T02 — window geometry (iter2-ext N-03 / N-04 / N-05).
 *
 * Covers the three root causes fixed in this task:
 *
 *   RC-1  the persisted record was a PhysicalSize but was restored as a
 *         LogicalSize, inflating the window by the scale factor on every
 *         launch. Every record now needs `schema: 2` + `unit: 'logical'`;
 *         anything else is dropped so the stale value cannot be rescaled.
 *   RC-2  the startup `setSize` echoed back through `onResized` and
 *         overwrote the user's size with the clamped one. A readiness gate
 *         silences persistence until the atomic apply has finished.
 *   RC-4  `MIN_W/MIN_H` in `lib/tauri.ts` drifted away from
 *         `tauri.conf.json`. The drift test at the bottom pins `WINDOW_MIN`
 *         against the real config file so it can never happen again.
 *
 * `lib/windowGeometry.ts` is pure by construction, so most of this runs with
 * no mocking at all. The `applyStartupGeometry` / `persistWindowState`
 * section mocks the Tauri bridges to assert the orchestration contract
 * (exactly one setSize, silence window, close-time write guard).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Imported (not hand-copied) on purpose: this is the drift guard's teeth.
// `@types/node` is not a dependency of this workspace, so the config is pulled
// in through `resolveJsonModule` rather than `readFileSync`.
import tauriConf from "../../src-tauri/tauri.conf.json";

import {
  CLOSE_WRITE_TOLERANCE,
  DIRTY_OVERSIZE_FACTOR,
  WINDOW_DEFAULT,
  WINDOW_MARGIN,
  WINDOW_MIN,
  clampAxis,
  computeStartupGeometry,
  getStartupSize,
  isGeometryReady,
  isValidGeometry,
  markGeometryReady,
  minWindowWidth,
  parsePersistedGeometry,
  resetGeometryGate,
  shouldPersist,
  shouldPersistOnClose,
  wasClampedAtStartup,
  type WorkArea,
} from "../lib/windowGeometry";

/** A comfortable 1920x1080 @100% desktop (work area minus the taskbar). */
const BIG: WorkArea = { width: 1920, height: 1040 };

/** 1366x768 @150% scaling -> ~911x470 logical. The RC-4 pathological case. */
const TINY: WorkArea = { width: 911, height: 470 };

/** Build a well-formed persisted record. */
function record(
  width: number,
  height: number,
  maximized = false,
): Record<string, unknown> {
  return { schema: 2, unit: "logical", width, height, maximized };
}

// ---------------------------------------------------------------------------
// isValidGeometry
// ---------------------------------------------------------------------------

describe("isValidGeometry", () => {
  it("accepts a fully marked record", () => {
    expect(isValidGeometry(record(1200, 800))).toBe(true);
    expect(isValidGeometry(record(1200, 800, true))).toBe(true);
  });

  it("rejects non-objects", () => {
    for (const v of [null, undefined, 0, 42, "1200x800", true, []]) {
      expect(isValidGeometry(v)).toBe(false);
    }
  });

  it("rejects a record without the schema marker", () => {
    expect(
      isValidGeometry({ unit: "logical", width: 1200, height: 800, maximized: false }),
    ).toBe(false);
  });

  it("rejects a record without the unit marker (RC-1 legacy shape)", () => {
    // Exactly what pre-iter2-ext builds wrote: bare PhysicalSize numbers.
    expect(isValidGeometry({ width: 1500, height: 1050, maximized: false })).toBe(
      false,
    );
  });

  it("rejects a wrong schema version or a wrong unit", () => {
    expect(isValidGeometry(record(1200, 800) && { ...record(1200, 800), schema: 1 })).toBe(
      false,
    );
    expect(isValidGeometry({ ...record(1200, 800), unit: "physical" })).toBe(false);
  });

  it("rejects non-positive / non-finite / non-numeric dimensions", () => {
    expect(isValidGeometry({ ...record(1200, 800), width: 0 })).toBe(false);
    expect(isValidGeometry({ ...record(1200, 800), height: -800 })).toBe(false);
    expect(isValidGeometry({ ...record(1200, 800), width: Number.NaN })).toBe(false);
    expect(isValidGeometry({ ...record(1200, 800), height: Infinity })).toBe(false);
    expect(isValidGeometry({ ...record(1200, 800), width: "1200" })).toBe(false);
  });

  it("rejects a non-boolean maximized flag", () => {
    expect(isValidGeometry({ ...record(1200, 800), maximized: "yes" })).toBe(false);
    expect(isValidGeometry({ schema: 2, unit: "logical", width: 1200, height: 800 })).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// parsePersistedGeometry — the self-heal path
// ---------------------------------------------------------------------------

describe("parsePersistedGeometry — legacy self-heal (RC-1)", () => {
  it("returns null for a legacy record missing `unit`", () => {
    // The 150%-scaling inflation victim: logical 1000x700 stored as physical.
    expect(parsePersistedGeometry({ width: 1500, height: 1050, maximized: false })).toBe(
      null,
    );
  });

  it("returns null for missing / malformed input", () => {
    expect(parsePersistedGeometry(null)).toBe(null);
    expect(parsePersistedGeometry(undefined)).toBe(null);
    expect(parsePersistedGeometry("nonsense")).toBe(null);
    expect(parsePersistedGeometry({})).toBe(null);
  });

  it("never rescales a legacy value — it drops it entirely", () => {
    // Guard against a "helpful" future fix that divides by the scale factor:
    // the unit of a legacy record is unknowable, so no value may survive.
    const legacy = { width: 1500, height: 1050, maximized: false };
    expect(parsePersistedGeometry(legacy, BIG)).toBe(null);
  });

  it("returns a rounded copy when no work area is supplied", () => {
    expect(parsePersistedGeometry(record(1200.4, 800.6))).toEqual({
      schema: 2,
      unit: "logical",
      width: 1200,
      height: 801,
      maximized: false,
    });
  });

  it("preserves the maximized flag", () => {
    expect(parsePersistedGeometry(record(1200, 800, true))?.maximized).toBe(true);
  });
});

describe("parsePersistedGeometry — clamping against a work area", () => {
  it("leaves an in-band record untouched", () => {
    const parsed = parsePersistedGeometry(record(1200, 800), BIG);
    expect(parsed).toMatchObject({ width: 1200, height: 800 });
  });

  it("clamps a record larger than the work area minus the margin", () => {
    const parsed = parsePersistedGeometry(record(3000, 2000), BIG);
    expect(parsed).toMatchObject({
      width: BIG.width - WINDOW_MARGIN,
      height: BIG.height - WINDOW_MARGIN,
    });
  });

  it("raises a record smaller than the dynamic minimum", () => {
    const parsed = parsePersistedGeometry(record(400, 300), BIG);
    expect(parsed).toMatchObject({
      width: minWindowWidth(BIG.width),
      height: WINDOW_MIN.height,
    });
  });

  it("keeps a record that sits between the dynamic minimum and the old 960", () => {
    // 700 < 960 (old fixed minimum) but 700 > 640 (1920 / 3) — it is legal now.
    const parsed = parsePersistedGeometry(record(700, 700), BIG);
    expect(parsed).toMatchObject({ width: 700, height: 700 });
  });

  it("small-screen fallback: goes BELOW WINDOW_MIN rather than overflow", () => {
    // 911x470 logical cannot satisfy 960x480 — overflowing would push the
    // custom drag region off-screen and make the window ungrabbable.
    const parsed = parsePersistedGeometry(record(1400, 900), TINY);
    expect(parsed?.width).toBe(TINY.width - WINDOW_MARGIN);
    expect(parsed?.height).toBe(TINY.height - WINDOW_MARGIN);
    expect(parsed!.width).toBeLessThan(WINDOW_MIN.width);
    expect(parsed!.height).toBeLessThan(WINDOW_MIN.height);
  });

  it("keeps the window inside the work area on every axis", () => {
    for (const work of [BIG, TINY, { width: 1280, height: 700 }]) {
      const parsed = parsePersistedGeometry(record(5000, 5000), work)!;
      expect(parsed.width).toBeLessThanOrEqual(work.width);
      expect(parsed.height).toBeLessThanOrEqual(work.height);
    }
  });
});

// ---------------------------------------------------------------------------
// clampAxis
// ---------------------------------------------------------------------------

describe("clampAxis", () => {
  it("clamps into [min, work - margin]", () => {
    expect(clampAxis(1200, 960, 1920)).toBe(1200);
    expect(clampAxis(5000, 960, 1920)).toBe(1920 - WINDOW_MARGIN);
    expect(clampAxis(100, 960, 1920)).toBe(960);
  });

  it("lets the minimum give way when the screen is too small", () => {
    expect(clampAxis(1400, 960, 911)).toBe(911 - WINDOW_MARGIN);
    expect(clampAxis(100, 960, 911)).toBe(911 - WINDOW_MARGIN);
  });

  it("rounds to whole logical pixels and never returns a non-positive size", () => {
    expect(clampAxis(1200.6, 960, 1920)).toBe(1201);
    expect(clampAxis(1200, 960, 10)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// minWindowWidth — the dynamic minimum (one third of the screen width)
// ---------------------------------------------------------------------------

describe("minWindowWidth", () => {
  it("is one third of the screen width, rounded to whole logical pixels", () => {
    expect(minWindowWidth(1920)).toBe(640);
    expect(minWindowWidth(2560)).toBe(853);
    expect(minWindowWidth(1000)).toBe(333);
  });

  it("never returns a non-positive constraint", () => {
    expect(minWindowWidth(1)).toBe(1);
    expect(minWindowWidth(0)).toBe(1);
    expect(minWindowWidth(-500)).toBe(1);
    expect(minWindowWidth(Number.NaN)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeStartupGeometry — the §3.1 decision table, row by row
// ---------------------------------------------------------------------------

describe("computeStartupGeometry — decision table", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("row 1 — no record: falls back to the default size", () => {
    const plan = computeStartupGeometry(null, BIG);
    expect(plan).toEqual({
      width: WINDOW_DEFAULT.width,
      height: WINDOW_DEFAULT.height,
      maximize: false,
      source: "default",
    });
  });

  it("row 1 — unmarked legacy record: falls back, does NOT reuse the numbers", () => {
    const plan = computeStartupGeometry(
      { width: 1500, height: 1050, maximized: false },
      BIG,
    );
    expect(plan.source).toBe("default");
    expect(plan.width).toBe(WINDOW_DEFAULT.width);
  });

  it("row 1 — the default is itself clamped on a small screen", () => {
    const plan = computeStartupGeometry(null, TINY);
    expect(plan.source).toBe("default");
    expect(plan.width).toBe(TINY.width - WINDOW_MARGIN);
    expect(plan.height).toBe(TINY.height - WINDOW_MARGIN);
  });

  it("row 2 — maximized: sets maximize and still computes a restore size", () => {
    const plan = computeStartupGeometry(record(1200, 800, true), BIG);
    expect(plan).toEqual({
      width: 1200,
      height: 800,
      maximize: true,
      source: "maximized",
    });
  });

  it("row 3 — absurdly oversized record is discarded, not clamped", () => {
    const huge = record(BIG.width * DIRTY_OVERSIZE_FACTOR + 10, 900);
    const plan = computeStartupGeometry(huge, BIG);
    expect(plan.source).toBe("default");
    expect(plan.width).toBe(WINDOW_DEFAULT.width);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("row 4 — a record slightly too big is clamped, not discarded", () => {
    const plan = computeStartupGeometry(record(2000, 1000), BIG);
    expect(plan.source).toBe("clamped");
    expect(plan.width).toBe(BIG.width - WINDOW_MARGIN);
    expect(plan.height).toBe(1000);
    expect(warn).not.toHaveBeenCalled();
  });

  it("row 5 — a too-small record is raised to the dynamic minimum", () => {
    const plan = computeStartupGeometry(record(500, 300), BIG);
    expect(plan).toEqual({
      width: minWindowWidth(BIG.width),
      height: WINDOW_MIN.height,
      maximize: false,
      source: "raised",
    });
  });

  it("row 5/6 — below the old fixed 960 but above 1/3 screen is honoured", () => {
    const plan = computeStartupGeometry(record(700, 700), BIG);
    expect(plan).toEqual({
      width: 700,
      height: 700,
      maximize: false,
      source: "remembered",
    });
  });

  it("row 6 — an in-band record is honoured verbatim", () => {
    const plan = computeStartupGeometry(record(1234, 789), BIG);
    expect(plan).toEqual({
      width: 1234,
      height: 789,
      maximize: false,
      source: "remembered",
    });
  });

  it("'clamped' outranks 'raised' when one axis shrinks and the other grows", () => {
    // Too wide for the screen, too short for the minimum.
    const plan = computeStartupGeometry(record(2000, 300), BIG);
    expect(plan.source).toBe("clamped");
    expect(plan.width).toBe(BIG.width - WINDOW_MARGIN);
    expect(plan.height).toBe(WINDOW_MIN.height);
  });

  it("small screen: reports 'clamped' and stays inside the work area", () => {
    // Height 700 is too tall for the 470-logical screen but stays under the
    // 1.5x dirty-data threshold (705), so row 3 does NOT discard it — it gets
    // clamped to fit instead (the RC-1 no-inflate behaviour on a small panel).
    const plan = computeStartupGeometry(record(1200, 700), TINY);
    expect(plan.source).toBe("clamped");
    expect(plan.width).toBeLessThanOrEqual(TINY.width);
    expect(plan.height).toBeLessThanOrEqual(TINY.height);
  });

  it("tolerates a degenerate work area instead of producing NaN", () => {
    for (const work of [
      { width: 0, height: 0 },
      { width: Number.NaN, height: Number.NaN },
      undefined as unknown as WorkArea,
    ]) {
      const plan = computeStartupGeometry(record(1200, 800), work);
      expect(Number.isFinite(plan.width)).toBe(true);
      expect(Number.isFinite(plan.height)).toBe(true);
      expect(plan.width).toBeGreaterThan(0);
      expect(plan.height).toBeGreaterThan(0);
    }
  });

  it("is idempotent — re-running on its own output never drifts (RC-1 core)", () => {
    // The bug was that each launch grew the window. Feeding the applied size
    // back in as the remembered record must be a fixed point.
    for (const work of [BIG, TINY]) {
      let size = { width: 1000, height: 700 };
      for (let launch = 0; launch < 5; launch += 1) {
        const plan = computeStartupGeometry(
          record(size.width, size.height),
          work,
        );
        if (launch > 0) {
          expect(plan.width).toBe(size.width);
          expect(plan.height).toBe(size.height);
        }
        size = { width: plan.width, height: plan.height };
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Startup silence window + close-time write guard (RC-2)
// ---------------------------------------------------------------------------

describe("geometry gate — startup silence window", () => {
  beforeEach(() => {
    resetGeometryGate();
  });

  it("refuses persistence before the startup apply completes", () => {
    expect(isGeometryReady()).toBe(false);
    expect(shouldPersist()).toBe(false);
  });

  it("allows persistence once the apply is marked done", () => {
    markGeometryReady({
      width: 1200,
      height: 800,
      maximize: false,
      source: "remembered",
    });
    expect(isGeometryReady()).toBe(true);
    expect(shouldPersist()).toBe(true);
  });

  it("still opens the gate when the apply failed (applied === null)", () => {
    markGeometryReady(null);
    expect(shouldPersist()).toBe(true);
    expect(wasClampedAtStartup()).toBe(false);
    expect(getStartupSize()).toBe(null);
  });

  it("records the clamp flag and the applied size", () => {
    markGeometryReady({
      width: 879,
      height: 438,
      maximize: false,
      source: "clamped",
    });
    expect(wasClampedAtStartup()).toBe(true);
    expect(getStartupSize()).toEqual({ width: 879, height: 438 });
  });

  it("resetting re-opens the silence window", () => {
    markGeometryReady({
      width: 879,
      height: 438,
      maximize: false,
      source: "clamped",
    });
    resetGeometryGate();
    expect(shouldPersist()).toBe(false);
    expect(wasClampedAtStartup()).toBe(false);
  });
});

describe("shouldPersistOnClose — clamp write protection", () => {
  beforeEach(() => {
    resetGeometryGate();
  });

  it("refuses while the gate is still closed", () => {
    expect(shouldPersistOnClose({ width: 1200, height: 800 })).toBe(false);
  });

  it("allows a normal write when nothing was clamped", () => {
    markGeometryReady({
      width: 1200,
      height: 800,
      maximize: false,
      source: "remembered",
    });
    expect(shouldPersistOnClose({ width: 1200, height: 800 })).toBe(true);
  });

  it("skips the write when clamped and the user never touched the window", () => {
    markGeometryReady({
      width: 879,
      height: 438,
      maximize: false,
      source: "clamped",
    });
    expect(shouldPersistOnClose({ width: 879, height: 438 })).toBe(false);
  });

  it("tolerates sub-pixel jitter within CLOSE_WRITE_TOLERANCE", () => {
    markGeometryReady({
      width: 879,
      height: 438,
      maximize: false,
      source: "clamped",
    });
    expect(
      shouldPersistOnClose({
        width: 879 + CLOSE_WRITE_TOLERANCE,
        height: 438 - CLOSE_WRITE_TOLERANCE,
      }),
    ).toBe(false);
  });

  it("writes once the user actually resizes a clamped window", () => {
    markGeometryReady({
      width: 879,
      height: 438,
      maximize: false,
      source: "clamped",
    });
    expect(shouldPersistOnClose({ width: 879, height: 500 })).toBe(true);
    expect(shouldPersistOnClose({ width: 700, height: 438 })).toBe(true);
  });

  it("does not protect a 'default' or 'raised' startup", () => {
    for (const source of ["default", "raised"] as const) {
      resetGeometryGate();
      markGeometryReady({ width: 960, height: 480, maximize: false, source });
      expect(shouldPersistOnClose({ width: 960, height: 480 })).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Orchestration contract in lib/tauri.ts
// ---------------------------------------------------------------------------

const setSize = vi.fn(async () => {});
const setMinSize = vi.fn(async () => {});
const center = vi.fn(async () => {});
const maximize = vi.fn(async () => {});
const isMaximized = vi.fn(async () => false);
const scaleFactor = vi.fn(async () => 1.5);
const innerSize = vi.fn(async () => ({
  width: 1800,
  height: 1200,
  toLogical: (sf: number) => ({ width: 1800 / sf, height: 1200 / sf }),
}));

const currentMonitor = vi.fn(async () => ({
  scaleFactor: 1.5,
  size: { width: 2880, height: 1620 },
  workArea: { size: { width: 2880, height: 1560 } },
}));

const storeGetMock = vi.fn(async (_key: string): Promise<unknown> => null);
const storeSetMock = vi.fn(async (_key: string, _value: unknown) => {});

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setSize,
    setMinSize,
    center,
    maximize,
    isMaximized,
    scaleFactor,
    innerSize,
    onResized: vi.fn(async () => () => {}),
    onCloseRequested: vi.fn(async () => () => {}),
    minimize: vi.fn(async () => {}),
    unmaximize: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
  }),
  currentMonitor: () => currentMonitor(),
  primaryMonitor: () => currentMonitor(),
}));

vi.mock("@tauri-apps/api/dpi", () => ({
  LogicalSize: class {
    readonly type = "Logical";
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(async () => true) }));

vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn(async () => ({
    get: (key: string) => storeGetMock(key),
    set: (key: string, value: unknown) => storeSetMock(key, value),
  })),
}));

const { applyStartupGeometry, persistWindowState, __setGeometryReadyForTest } =
  await import("../lib/tauri");

describe("applyStartupGeometry — atomic apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMaximized.mockResolvedValue(false);
    storeGetMock.mockResolvedValue(null);
    resetGeometryGate();
  });

  it("performs exactly ONE setSize and then centers (RC-2)", async () => {
    await applyStartupGeometry();
    expect(setSize).toHaveBeenCalledOnce();
    expect(center).toHaveBeenCalledOnce();
    expect(maximize).not.toHaveBeenCalled();
  });

  it("sets the OS minimum width to one third of the screen width", async () => {
    // 2880px physical @1.5 -> 1920 logical -> min width 640; height keeps the
    // fixed WINDOW_MIN.height floor.
    await applyStartupGeometry();
    expect(setMinSize).toHaveBeenCalledWith(
      expect.objectContaining({
        width: minWindowWidth(2880 / 1.5),
        height: WINDOW_MIN.height,
      }),
    );
  });

  it("sizes in LOGICAL pixels derived from the logical work area (RC-1)", async () => {
    // 2880x1560 physical @1.5 -> 1920x1040 logical, so 1400x900 fits verbatim.
    await applyStartupGeometry();
    expect(setSize).toHaveBeenCalledWith(
      expect.objectContaining({
        width: WINDOW_DEFAULT.width,
        height: WINDOW_DEFAULT.height,
      }),
    );
  });

  it("opens the gate and never writes during startup", async () => {
    await applyStartupGeometry();
    expect(shouldPersist()).toBe(true);
    expect(storeSetMock).not.toHaveBeenCalled();
  });

  it("maximizes only when the record says so", async () => {
    storeGetMock.mockResolvedValue(record(1200, 800, true));
    await applyStartupGeometry();
    expect(setSize).toHaveBeenCalledOnce();
    expect(maximize).toHaveBeenCalledOnce();
  });

  it("opens the gate even when the Tauri calls throw", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setSize.mockRejectedValueOnce(new Error("no window"));
    await applyStartupGeometry();
    expect(shouldPersist()).toBe(true);
    warn.mockRestore();
  });
});

describe("persistWindowState — logical units + silence window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMaximized.mockResolvedValue(false);
    storeGetMock.mockResolvedValue(null);
    resetGeometryGate();
  });

  it("writes nothing while the gate is closed (RC-2)", async () => {
    await persistWindowState();
    expect(storeSetMock).not.toHaveBeenCalled();
  });

  it("converts PhysicalSize to logical before writing (RC-1)", async () => {
    __setGeometryReadyForTest(true);
    await persistWindowState();
    // 1800x1200 physical @1.5 -> 1200x800 logical.
    expect(storeSetMock).toHaveBeenCalledWith("window-state", {
      schema: 2,
      unit: "logical",
      width: 1200,
      height: 800,
      maximized: false,
    });
  });

  it("stamps schema/unit so the next launch can trust the record", async () => {
    __setGeometryReadyForTest(true);
    await persistWindowState();
    const written = storeSetMock.mock.calls[0][1];
    expect(isValidGeometry(written)).toBe(true);
  });

  it("round-trips: what it writes is what the next launch applies", async () => {
    __setGeometryReadyForTest(true);
    await persistWindowState();
    const written = storeSetMock.mock.calls[0][1];
    const plan = computeStartupGeometry(written, { width: 1920, height: 1040 });
    expect(plan).toMatchObject({ width: 1200, height: 800, source: "remembered" });
  });

  it("keeps the pre-maximize size while maximized", async () => {
    __setGeometryReadyForTest(true);
    isMaximized.mockResolvedValue(true);
    storeGetMock.mockResolvedValue(record(1100, 750));
    await persistWindowState();
    expect(storeSetMock).toHaveBeenCalledWith("window-state", {
      schema: 2,
      unit: "logical",
      width: 1100,
      height: 750,
      maximized: true,
    });
  });

  it("__setGeometryReadyForTest(false) re-closes the gate", async () => {
    __setGeometryReadyForTest(true);
    __setGeometryReadyForTest(false);
    await persistWindowState();
    expect(storeSetMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// RC-4 drift guard — WINDOW_MIN vs tauri.conf.json
// ---------------------------------------------------------------------------

describe("tauri.conf.json drift guard (RC-4)", () => {
  const mainWindow = tauriConf.app.windows[0] as Record<string, unknown>;

  it("minWidth matches WINDOW_MIN.width", () => {
    expect(mainWindow.minWidth).toBe(WINDOW_MIN.width);
  });

  it("minHeight matches WINDOW_MIN.height", () => {
    // Q3: lowered 560 -> 480 so a 1366x768 @150% panel (~470 logical height)
    // can actually satisfy the declared minimum.
    expect(mainWindow.minHeight).toBe(WINDOW_MIN.height);
  });

  it("the declared default size matches WINDOW_DEFAULT", () => {
    expect(mainWindow.width).toBe(WINDOW_DEFAULT.width);
    expect(mainWindow.height).toBe(WINDOW_DEFAULT.height);
  });

  it("has NO `theme` field (iter2 A-1 must not regress)", () => {
    // Re-adding it pins the window to a fixed theme and breaks `auto`.
    expect("theme" in mainWindow).toBe(false);
  });

  it("keeps preventOverflow enabled", () => {
    expect(mainWindow.preventOverflow).toBe(true);
  });
});
