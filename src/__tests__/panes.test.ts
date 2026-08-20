/**
 * Unit tests for `src/store/usePanesStore.ts` (design §3.2 / R-09 / R-12 / R-25).
 *
 * The store is pure zustand state — no Tauri, no DOM — so it can be driven
 * directly. Each test resets to the shipped initial state first.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  clampSplitRatio,
  usePanesStore,
} from "../store/usePanesStore";
import type { AppConfig } from "../types";

function reset(): void {
  usePanesStore.setState({
    layout: "single",
    panes: [{ id: "A", tabId: null, viewMode: "live", cursor: { line: 1, col: 1 }, scrollTop: 0 }],
    focusedPaneId: "A",
    splitRatio: 0.5,
  });
}

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    configVersion: 2,
    theme: "auto",
    fontFamily: "Inter",
    fontSize: 14,
    defaultView: "live",
    workspaceLayout: "single",
    splitRatio: 0.5,
    paneViewModes: ["live", "preview"],
    sidebarVisible: true,
    sidebarWidth: 248,
    lastFolder: null,
    recentFiles: [],
    // iter2-ext (configVersion 3) fields — required by the AppConfig contract;
    // this fixture only needs them to type-check, no assertion depends on them.
    accent: "sky",
    accentCustom: null,
    customAccents: [],
    tocVisible: false,
    tocPosition: "right",
    tocWidth: 220,
    window: { width: 1200, height: 800, maximized: false },
    autoSave: true,
    autoSaveDelay: 800,
    useProseMirrorLive: false,
    useCodeMirrorSource: false,
    showScrollbar: true,
    ...overrides,
  };
}

beforeEach(reset);

describe("clampSplitRatio", () => {
  it("keeps in-range values untouched", () => {
    expect(clampSplitRatio(0.5)).toBe(0.5);
    expect(clampSplitRatio(0.35)).toBe(0.35);
  });

  it("clamps out-of-range values to the allowed window", () => {
    expect(clampSplitRatio(0)).toBe(MIN_SPLIT_RATIO);
    expect(clampSplitRatio(-3)).toBe(MIN_SPLIT_RATIO);
    expect(clampSplitRatio(1)).toBe(MAX_SPLIT_RATIO);
    expect(clampSplitRatio(42)).toBe(MAX_SPLIT_RATIO);
  });

  it("falls back to 0.5 for non-finite input", () => {
    expect(clampSplitRatio(Number.NaN)).toBe(0.5);
    expect(clampSplitRatio(Number.POSITIVE_INFINITY)).toBe(0.5);
  });
});

describe("layout transitions", () => {
  it("starts as a single pane named A", () => {
    const s = usePanesStore.getState();
    expect(s.layout).toBe("single");
    expect(s.panes).toHaveLength(1);
    expect(s.panes[0]?.id).toBe("A");
    expect(s.focusedPaneId).toBe("A");
  });

  it("splitting mirrors pane A's document into pane B (same buffer)", () => {
    usePanesStore.getState().setPaneTab("A", "tab-1");
    usePanesStore.getState().setLayout("split");

    const s = usePanesStore.getState();
    expect(s.layout).toBe("split");
    expect(s.panes).toHaveLength(2);
    expect(s.panes[1]?.id).toBe("B");
    expect(s.panes[1]?.tabId).toBe("tab-1");
    expect(s.panes[1]?.viewMode).toBe("preview");
  });

  it("splitting twice is idempotent", () => {
    usePanesStore.getState().setLayout("split");
    usePanesStore.getState().setPaneViewMode("B", "edit");
    usePanesStore.getState().setLayout("split");
    expect(usePanesStore.getState().panes).toHaveLength(2);
    expect(usePanesStore.getState().getPane("B")?.viewMode).toBe("edit");
  });

  it("collapsing keeps the focused pane and relabels it A", () => {
    usePanesStore.getState().setPaneTab("A", "tab-1");
    usePanesStore.getState().setLayout("split");
    usePanesStore.getState().setPaneTab("B", "tab-2");
    usePanesStore.getState().setFocusedPane("B");

    usePanesStore.getState().setLayout("single");

    const s = usePanesStore.getState();
    expect(s.layout).toBe("single");
    expect(s.panes).toHaveLength(1);
    expect(s.panes[0]?.id).toBe("A");
    expect(s.panes[0]?.tabId).toBe("tab-2");
    expect(s.focusedPaneId).toBe("A");
  });
});

describe("pane mutators", () => {
  it("setPaneTab resets that pane's caret only", () => {
    usePanesStore.getState().setLayout("split");
    usePanesStore.getState().setPaneCursor("A", { line: 9, col: 4 });
    usePanesStore.getState().setPaneCursor("B", { line: 3, col: 2 });

    usePanesStore.getState().setPaneTab("A", "tab-9");

    expect(usePanesStore.getState().getPane("A")?.cursor).toEqual({ line: 1, col: 1 });
    expect(usePanesStore.getState().getPane("B")?.cursor).toEqual({ line: 3, col: 2 });
  });

  it("setPaneViewMode is per pane (R-12)", () => {
    usePanesStore.getState().setLayout("split");
    usePanesStore.getState().setPaneViewMode("A", "edit");
    usePanesStore.getState().setPaneViewMode("B", "preview");
    expect(usePanesStore.getState().getPane("A")?.viewMode).toBe("edit");
    expect(usePanesStore.getState().getPane("B")?.viewMode).toBe("preview");
  });

  it("setPaneCursor does not create a new object when the value is unchanged", () => {
    usePanesStore.getState().setPaneCursor("A", { line: 5, col: 5 });
    const before = usePanesStore.getState().getPane("A");
    usePanesStore.getState().setPaneCursor("A", { line: 5, col: 5 });
    expect(usePanesStore.getState().getPane("A")).toBe(before);
  });

  it("setPaneScroll snapshots the scroll offset", () => {
    usePanesStore.getState().setPaneScroll("A", 320);
    expect(usePanesStore.getState().getPane("A")?.scrollTop).toBe(320);
  });

  it("setSplitRatio clamps", () => {
    usePanesStore.getState().setSplitRatio(0.05);
    expect(usePanesStore.getState().splitRatio).toBe(MIN_SPLIT_RATIO);
    usePanesStore.getState().setSplitRatio(0.99);
    expect(usePanesStore.getState().splitRatio).toBe(MAX_SPLIT_RATIO);
    usePanesStore.getState().setSplitRatio(0.4);
    expect(usePanesStore.getState().splitRatio).toBe(0.4);
  });

  it("setFocusedPane ignores unknown panes", () => {
    usePanesStore.getState().setFocusedPane("B"); // not mounted in single layout
    expect(usePanesStore.getState().focusedPaneId).toBe("A");
  });
});

describe("selectors", () => {
  it("getFocusedTabId follows the focused pane", () => {
    usePanesStore.getState().setPaneTab("A", "tab-a");
    usePanesStore.getState().setLayout("split");
    usePanesStore.getState().setPaneTab("B", "tab-b");

    expect(usePanesStore.getState().getFocusedTabId()).toBe("tab-a");
    usePanesStore.getState().setFocusedPane("B");
    expect(usePanesStore.getState().getFocusedTabId()).toBe("tab-b");
  });

  it("getPane returns undefined for a pane that is not mounted", () => {
    expect(usePanesStore.getState().getPane("B")).toBeUndefined();
  });
});

describe("hydrate (R-25)", () => {
  it("restores a single-pane workspace", () => {
    usePanesStore.getState().hydrate(baseConfig({ paneViewModes: ["edit", "preview"] }), "tab-1");
    const s = usePanesStore.getState();
    expect(s.layout).toBe("single");
    expect(s.panes).toHaveLength(1);
    expect(s.panes[0]?.viewMode).toBe("edit");
    expect(s.panes[0]?.tabId).toBe("tab-1");
  });

  it("restores a split workspace with both view modes and the ratio", () => {
    usePanesStore.getState().hydrate(
      baseConfig({
        workspaceLayout: "split",
        splitRatio: 0.62,
        paneViewModes: ["live", "edit"],
      }),
      "tab-1",
    );
    const s = usePanesStore.getState();
    expect(s.layout).toBe("split");
    expect(s.panes.map((p) => p.viewMode)).toEqual(["live", "edit"]);
    expect(s.panes.every((p) => p.tabId === "tab-1")).toBe(true);
    expect(s.splitRatio).toBeCloseTo(0.62, 5);
  });

  it("clamps a corrupt persisted ratio", () => {
    usePanesStore.getState().hydrate(baseConfig({ splitRatio: 9 }), null);
    expect(usePanesStore.getState().splitRatio).toBe(MAX_SPLIT_RATIO);
  });

  it("accepts a null initial tab", () => {
    usePanesStore.getState().hydrate(baseConfig({ workspaceLayout: "split" }), null);
    expect(usePanesStore.getState().panes.every((p) => p.tabId === null)).toBe(true);
  });
});
