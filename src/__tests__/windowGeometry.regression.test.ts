/**
 * T02 window-geometry — QA independent regression pass (iter2-ext).
 *
 * `windowGeometry.test.ts` already covers the happy paths and the §3.1 decision
 * table. This file closes the specific gaps the QA review flagged, all aimed at
 * *silent* failure modes that a passing build could still hide:
 *
 *   • RC-1 partial-marker dirty data — a half-migrated record that carries ONE
 *     of the two discriminators is the most insidious legacy shape; it must
 *     still be discarded, never reinterpreted.
 *   • RC-1 inflation replay — the literal reproduction of the original bug
 *     (physical size restored as logical). Across repeated launches the plan
 *     must be a fixed point at the default, never growing.
 *   • RC-2 onResized-during-silence — the persistence feedback loop reproduced
 *     through the real `listenWindowResize` → `persistWindowState` wiring, not
 *     just the gate predicate in isolation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  WINDOW_DEFAULT,
  WINDOW_MARGIN,
  WINDOW_MIN,
  computeStartupGeometry,
  isValidGeometry,
  parsePersistedGeometry,
  type WorkArea,
} from "../lib/windowGeometry";

const BIG: WorkArea = { width: 1920, height: 1040 };
const TINY: WorkArea = { width: 911, height: 470 };

// ---------------------------------------------------------------------------
// RC-1 — partial-marker dirty data must be discarded, never reinterpreted
// ---------------------------------------------------------------------------

describe("RC-1 partial-marker records (half-migrated dirty data)", () => {
  it("drops a record that has `schema: 2` but no `unit`", () => {
    // A build that added the schema stamp before the unit stamp would write
    // exactly this. The unit is still unknown -> the record is untrustworthy.
    const half = { schema: 2, width: 1500, height: 1050, maximized: false };
    expect(isValidGeometry(half)).toBe(false);
    expect(parsePersistedGeometry(half)).toBe(null);
    expect(parsePersistedGeometry(half, BIG)).toBe(null);
  });

  it("drops a record that has `unit: 'logical'` but no `schema`", () => {
    const half = { unit: "logical", width: 1200, height: 800, maximized: false };
    expect(isValidGeometry(half)).toBe(false);
    expect(parsePersistedGeometry(half)).toBe(null);
  });

  it("drops a record whose schema is a stringified 2 (loose-typed store)", () => {
    // Some store backends coerce numbers to strings on round-trip; a strict
    // `=== 2` guard must reject "2" rather than silently accept a stale record.
    const loose = { schema: "2", unit: "logical", width: 1200, height: 800, maximized: false };
    expect(isValidGeometry(loose)).toBe(false);
    expect(parsePersistedGeometry(loose)).toBe(null);
  });

  it("computeStartupGeometry falls back to default for every partial-marker shape", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const bad of [
      { schema: 2, width: 1500, height: 1050, maximized: false },
      { unit: "logical", width: 1500, height: 1050, maximized: false },
      { schema: 1, unit: "logical", width: 1500, height: 1050, maximized: false },
    ]) {
      const plan = computeStartupGeometry(bad, BIG);
      expect(plan.source).toBe("default");
      expect(plan.width).toBe(WINDOW_DEFAULT.width);
      expect(plan.height).toBe(WINDOW_DEFAULT.height);
    }
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// RC-1 — the original inflation bug, replayed across many launches
// ---------------------------------------------------------------------------

describe("RC-1 inflation replay — the literal original bug", () => {
  it("a legacy PhysicalSize record never inflates and never sticks (5 launches)", () => {
    // Pre-iter2-ext, logical 1000x700 on a 150% display was persisted as its
    // physical 1500x1050 and restored verbatim as logical, so every launch
    // multiplied the size by the scale factor. Now the unmarked record is
    // discarded every time and the plan is a fixed point at the default.
    const legacy = { width: 1500, height: 1050, maximized: false };
    let last: { width: number; height: number } | null = null;
    for (let launch = 0; launch < 5; launch += 1) {
      const plan = computeStartupGeometry(legacy, BIG);
      expect(plan.source).toBe("default");
      if (last) {
        expect(plan.width).toBe(last.width);
        expect(plan.height).toBe(last.height);
      }
      last = { width: plan.width, height: plan.height };
    }
    expect(last).toEqual({
      width: WINDOW_DEFAULT.width,
      height: WINDOW_DEFAULT.height,
    });
  });

  it("a clamped small-screen size is a fixed point (no per-launch drift on TINY)", () => {
    // A remembered 1400x900 does not fit the 911x470 panel. The first launch
    // clamps it; every subsequent launch that feeds the applied size back in
    // must return the SAME size (the small-screen equivalent of RC-1).
    let size = { width: 1400, height: 900 };
    const expected = {
      width: TINY.width - WINDOW_MARGIN,
      height: TINY.height - WINDOW_MARGIN,
    };
    for (let launch = 0; launch < 5; launch += 1) {
      const plan = computeStartupGeometry(
        { schema: 2, unit: "logical", ...size, maximized: false },
        TINY,
      );
      if (launch > 0) {
        expect(plan.width).toBe(size.width);
        expect(plan.height).toBe(size.height);
      }
      size = { width: plan.width, height: plan.height };
    }
    expect(size).toEqual(expected);
    expect(size.width).toBeLessThan(WINDOW_MIN.width);
  });
});

// ---------------------------------------------------------------------------
// RC-2 — onResized during the silence window, through the real wiring
// ---------------------------------------------------------------------------
//
// This block boots `lib/tauri.ts` against a Tauri mock whose `onResized`
// CAPTURES the handler, so the test can fire a resize event exactly like the
// runtime does and prove that `persistWindowState` writes nothing while the
// startup gate is closed — reproducing the RC-2 feedback loop end to end.

const setSize = vi.fn(async () => {});
const center = vi.fn(async () => {});
const maximize = vi.fn(async () => {});
const isMaximized = vi.fn(async () => false);
const scaleFactor = vi.fn(async () => 1.5);
const innerSize = vi.fn(async () => ({
  width: 1800,
  height: 1200,
  toLogical: (sf: number) => ({ width: 1800 / sf, height: 1200 / sf }),
}));

/** The live `onResized` handler, captured so the test can fire it on demand. */
let resizeHandler: (() => void) | null = null;

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
    center,
    maximize,
    isMaximized,
    scaleFactor,
    innerSize,
    onResized: vi.fn(async (cb: () => void) => {
      resizeHandler = cb;
      return () => {
        resizeHandler = null;
      };
    }),
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

const {
  applyStartupGeometry,
  persistWindowState,
  listenWindowResize,
  __setGeometryReadyForTest,
} = await import("../lib/tauri");

describe("RC-2 onResized during the startup silence window", () => {
  /** Captures the promise from each simulated resize so the test can await it. */
  let pendingPersist: Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    isMaximized.mockResolvedValue(false);
    storeGetMock.mockResolvedValue(null);
    resizeHandler = null;
    pendingPersist = Promise.resolve();
    __setGeometryReadyForTest(false);
  });

  it("a resize event fired before the apply completes writes nothing", async () => {
    // Wire the listener exactly as App.tsx does (minus the debounce timer).
    await listenWindowResize(() => {
      pendingPersist = persistWindowState();
    });
    expect(resizeHandler).toBeTypeOf("function");

    // The programmatic startup resize echoes back through onResized *now*,
    // while the gate is still closed. It must not reach the store.
    resizeHandler?.();
    await pendingPersist;
    expect(storeSetMock).not.toHaveBeenCalled();
  });

  it("the same resize event DOES persist once startup has finished", async () => {
    await listenWindowResize(() => {
      pendingPersist = persistWindowState();
    });

    // Startup completes -> gate opens.
    __setGeometryReadyForTest(true);
    resizeHandler?.();
    await pendingPersist;

    expect(storeSetMock).toHaveBeenCalledTimes(1);
    const [key, value] = storeSetMock.mock.calls[0];
    expect(key).toBe("window-state");
    // 1800x1200 physical @1.5 -> 1200x800 logical, correctly stamped.
    expect(value).toEqual({
      schema: 2,
      unit: "logical",
      width: 1200,
      height: 800,
      maximized: false,
    });
  });

  it("applyStartupGeometry never lets a startup resize reach the store", async () => {
    // Fire a resize in the middle of the atomic apply (before markGeometryReady
    // runs in the finally block): the gate is still closed, so nothing is written.
    let firedMidApply = false;
    setSize.mockImplementationOnce(async () => {
      // Simulate the OS emitting onResized as a reaction to setSize.
      resizeHandler?.();
      firedMidApply = true;
    });
    await listenWindowResize(() => {
      pendingPersist = persistWindowState();
    });
    await applyStartupGeometry();
    await pendingPersist;

    expect(firedMidApply).toBe(true);
    expect(storeSetMock).not.toHaveBeenCalled();
  });
});
