/**
 * Thin wrapper around the Tauri runtime APIs used by PureMark:
 * - window controls & close-guard
 * - window size persistence
 * - the `@tauri-apps/plugin-store` settings store
 *
 * These functions are only meaningful inside a Tauri context; they are kept
 * isolated here so the rest of the app talks to a single, well-typed surface.
 */
import {
  getCurrentWindow,
  currentMonitor,
  primaryMonitor,
} from "@tauri-apps/api/window";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { load, type Store } from "@tauri-apps/plugin-store";
import { guardWindowClose } from "./closeGuard";
import type { WindowGeometry } from "../types";
import {
  WINDOW_DEFAULT,
  WINDOW_MARGIN,
  computeStartupGeometry,
  markGeometryReady,
  parsePersistedGeometry,
  resetGeometryGate,
  shouldPersist,
  shouldPersistOnClose,
  type StartupGeometry,
  type WorkArea,
} from "./windowGeometry";

// ---------------------------------------------------------------------------
// Settings store (settings.json)
// ---------------------------------------------------------------------------

let storeInstance: Store | null = null;

/** Lazily open the singleton settings store. */
export async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await load("settings.json", { autoSave: true });
  }
  return storeInstance;
}

export async function storeGet<T>(key: string): Promise<T | null> {
  const store = await getStore();
  const value = await store.get<T>(key);
  return (value ?? null) as T | null;
}

export async function storeSet(key: string, value: unknown): Promise<void> {
  const store = await getStore();
  await store.set(key, value);
}

// ---------------------------------------------------------------------------
// Window controls
// ---------------------------------------------------------------------------

export async function minimizeWindow(): Promise<void> {
  await getCurrentWindow().minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  const win = getCurrentWindow();
  if (await win.isMaximized()) {
    await win.unmaximize();
  } else {
    await win.maximize();
  }
}

export async function closeWindow(): Promise<void> {
  await getCurrentWindow().close();
}

/**
 * Bring the main window to the front and give it focus. Used when a second
 * instance forwards a `open-file` event (file association double-click) — the
 * already-running app must surface itself instead of staying behind other
 * windows or minimized in the taskbar.
 *
 * Order matters on Windows: `unminimize` restores a minimized window, `show`
 * ensures it is visible, `setFocus` raises it. The Tauri 2 Window API exposes
 * all three; calling them together is safe even when already focused/shown.
 */
export async function focusWindow(): Promise<void> {
  const win = getCurrentWindow();
  await win.unminimize();
  await win.show();
  await win.setFocus();
}

// ---------------------------------------------------------------------------
// Window geometry (iter2-ext N-03 / N-04 / N-05)
//
// `window-state` (this store key) is the SINGLE source of truth for window
// geometry — `AppConfig.window` is @deprecated and must never be read or
// written. Everything persisted here is in LOGICAL pixels and carries the
// `schema` / `unit` markers so a record can never again be reinterpreted in
// the wrong unit (RC-1).
//
// ⛔ `applyStartupGeometry()` is the ONLY place allowed to call `setSize()`.
//    A second programmatic resize would re-open the RC-2 feedback loop.
// ---------------------------------------------------------------------------

const WINDOW_STATE_KEY = "window-state";

/** Read the current monitor's work area, converted to logical pixels. */
async function readLogicalWorkArea(): Promise<WorkArea> {
  const mon = (await currentMonitor()) ?? (await primaryMonitor());
  if (!mon) {
    // No monitor info (headless / API unavailable): pretend the screen is just
    // big enough for the default size so `computeStartupGeometry` returns it.
    return {
      width: WINDOW_DEFAULT.width + WINDOW_MARGIN,
      height: WINDOW_DEFAULT.height + WINDOW_MARGIN,
    };
  }
  const sf = mon.scaleFactor || 1;
  const area = mon.workArea?.size ?? mon.size;
  return { width: area.width / sf, height: area.height / sf };
}

/** Read the live window size in logical pixels. */
async function readLogicalWindowSize(): Promise<{
  width: number;
  height: number;
}> {
  const win = getCurrentWindow();
  const sf = await win.scaleFactor();
  // `innerSize()` is a PhysicalSize in Tauri v2 — converting here is exactly
  // the step whose absence caused the per-launch inflation loop (RC-1).
  const logical = (await win.innerSize()).toLogical(sf);
  return { width: logical.width, height: logical.height };
}

/**
 * Apply the startup window geometry **atomically**: read the persisted record,
 * validate it, clamp it against the current monitor, then perform exactly one
 * `setSize` + `center` (+ optional `maximize`).
 *
 * Replaces the old `restoreWindowState()` + `fitWindowToScreen()` pair, whose
 * second programmatic resize fed the clamped size straight back into the store
 * via `onResized` (RC-2).
 *
 * Persistence is silenced for the whole duration and re-enabled in `finally`,
 * so a failure here degrades to "default size, persistence still works" rather
 * than bricking either behaviour.
 */
export async function applyStartupGeometry(): Promise<void> {
  resetGeometryGate();
  let applied: StartupGeometry | null = null;
  try {
    const win = getCurrentWindow();
    const remembered = await storeGet<unknown>(WINDOW_STATE_KEY);
    const work = await readLogicalWorkArea();
    const plan = computeStartupGeometry(remembered, work);

    // The one and only setSize of the whole session.
    await win.setSize(new LogicalSize(plan.width, plan.height));
    await win.center();
    if (plan.maximize) {
      await win.maximize();
    }
    applied = plan;
  } catch (err) {
    console.warn("[tauri] applyStartupGeometry failed:", err);
  } finally {
    markGeometryReady(applied);
  }
}

/**
 * Persist the current window size under `window-state`, in logical pixels and
 * stamped with `schema: 2` / `unit: 'logical'`.
 *
 * No-ops during the startup silence window so programmatic sizing never
 * pollutes the user's remembered geometry.
 */
export async function persistWindowState(): Promise<void> {
  if (!shouldPersist()) return;
  try {
    const win = getCurrentWindow();
    const logical = await readLogicalWindowSize();
    const maximized = await win.isMaximized();

    let width = Math.round(logical.width);
    let height = Math.round(logical.height);
    if (maximized) {
      // While maximized the live size *is* the work area; storing it would lose
      // the restore rectangle. Keep the previously remembered size so that
      // un-maximizing after a restart returns to the pre-maximize size.
      const previous = parsePersistedGeometry(
        await storeGet<unknown>(WINDOW_STATE_KEY),
      );
      if (previous) {
        width = previous.width;
        height = previous.height;
      }
    }

    const state: WindowGeometry = {
      schema: 2,
      unit: "logical",
      width,
      height,
      maximized,
    };
    await storeSet(WINDOW_STATE_KEY, state);
  } catch {
    /* best-effort — ignore persistence errors */
  }
}

export async function listenWindowResize(cb: () => void): Promise<UnlistenFn> {
  return getCurrentWindow().onResized(() => cb());
}

/**
 * Test hook for the startup silence window.
 *
 * `true` mimics "startup finished, nothing was clamped"; `false` re-opens the
 * silence window. Production code must never call this.
 */
export function __setGeometryReadyForTest(v: boolean): void {
  if (v) {
    markGeometryReady(null);
  } else {
    resetGeometryGate();
  }
}

// ---------------------------------------------------------------------------
// Close guard (unsaved-changes protection)
// ---------------------------------------------------------------------------

/**
 * Persist on close, unless doing so would destroy the user's real preference.
 *
 * If the window had to be shrunk at startup to fit a smaller monitor and the
 * user never resized it afterwards, the live size is the clamped size — writing
 * it would make the shrink permanent and the original size would never come
 * back on the larger display. In that one case the write is skipped.
 */
async function persistWindowStateOnClose(): Promise<void> {
  try {
    const win = getCurrentWindow();
    const maximized = await win.isMaximized();
    if (!maximized) {
      const logical = await readLogicalWindowSize();
      if (!shouldPersistOnClose(logical)) return;
    }
  } catch {
    /* size probe failed — fall through to the normal persist path */
  }
  await persistWindowState();
}

/**
 * Intercepts the window close request. Persists the window size (subject to the
 * clamp guard above), and if there are unsaved changes prevents the close and
 * asks the user to confirm. Returns an unlisten function.
 */
export async function registerCloseGuard(
  isDirty: () => boolean,
): Promise<UnlistenFn> {
  return getCurrentWindow().onCloseRequested(async (event) => {
    await persistWindowStateOnClose();
    if (isDirty()) {
      event.preventDefault();
      // 升级为「先检测冲突 → 自定义弹窗 → 决策」（设计 T04 / 方案 A+B）
      const proceed = await guardWindowClose();
      if (proceed) {
        await getCurrentWindow().destroy();
      }
    }
  });
}
