/**
 * Contract tests for the iter2 UI migration (QA, round 1).
 *
 * The four migrated components no longer own any view state of their own:
 *
 *   • `EditorCard.tsx`   reads `layout` / `panes` / `splitRatio` from
 *                        `usePanesStore` and picks `CodeEditor` vs
 *                        `PreviewPane` from `pane.viewMode`;
 *   • `ViewSwitcher.tsx` calls `setPaneViewMode(focusedPaneId, mode)` and
 *                        `splitToggle()`;
 *   • `SettingsPanel.tsx` "默认视图" writes `config.defaultView` **and**
 *                        `setPaneViewMode(focusedPaneId, v)`;
 *   • `Workspace.tsx`    renders `<EditorCard />` with no props at all.
 *
 * `@testing-library/react` is not installed in this workspace (and QA is not
 * allowed to add dependencies), so instead of clicking the DOM these tests
 * exercise the exact store/router calls the handlers make and assert the state
 * the components read back. If one of these breaks, the corresponding UI
 * affordance is broken too.
 *
 * The Tauri bridges are mocked away: `useConfigStore.update()` fires a
 * `storeSet` and `useTabsStore` imports the fs commands at module load.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewMode } from "../types";

vi.mock("../lib/tauri", () => ({
  storeGet: vi.fn(async () => null),
  storeSet: vi.fn(async () => undefined),
}));

vi.mock("../commands/fsCommands", () => ({
  readFileText: vi.fn(async () => ""),
  writeFileText: vi.fn(async () => undefined),
  openFileDialog: vi.fn(async () => null),
  openFolderDialog: vi.fn(async () => null),
  saveFileDialog: vi.fn(async () => null),
  readDirTree: vi.fn(async () => []),
}));

const { usePanesStore } = await import("../store/usePanesStore");
const { useTabsStore } = await import("../store/useTabsStore");
const { useConfigStore, DEFAULT_CONFIG } = await import("../store/useConfigStore");
const { splitToggle, openInFocusedPane, focusPane } = await import("../lib/paneRouter");

function resetAll(): void {
  usePanesStore.setState({
    layout: "single",
    panes: [{ id: "A", tabId: null, viewMode: "live", cursor: { line: 1, col: 1 }, scrollTop: 0 }],
    focusedPaneId: "A",
    splitRatio: 0.5,
  });
  useTabsStore.setState({ tabs: [], activeId: null });
  useConfigStore.setState({
    config: { ...DEFAULT_CONFIG, window: { ...DEFAULT_CONFIG.window }, recentFiles: [] },
    loaded: true,
  });
}

beforeEach(resetAll);

/* ------------------------------------------------------------------ *
 * EditorCard — what it reads out of the store
 * ------------------------------------------------------------------ */

/** Mirrors `EditorCard.renderPane`: which component a pane resolves to. */
function componentFor(viewMode: ViewMode): "CodeEditor" | "PreviewPane" {
  return viewMode === "preview" ? "PreviewPane" : "CodeEditor";
}

describe("EditorCard — store inputs", () => {
  it("single layout exposes exactly one pane to render", () => {
    const s = usePanesStore.getState();
    expect(s.layout).toBe("single");
    expect(s.panes).toHaveLength(1);
    expect(s.panes[0]?.id).toBe("A");
  });

  it("split layout exposes two panes in left-to-right array order", () => {
    splitToggle();
    const s = usePanesStore.getState();
    expect(s.layout).toBe("split");
    expect(s.panes.map((p) => p.id)).toEqual(["A", "B"]);
  });

  it("each ViewMode maps to the component EditorCard mounts", () => {
    expect(componentFor("edit")).toBe("CodeEditor");
    expect(componentFor("live")).toBe("CodeEditor");
    expect(componentFor("preview")).toBe("PreviewPane");
  });

  it("the two panes can resolve to different components at the same time (R-12)", () => {
    splitToggle();
    usePanesStore.getState().setPaneViewMode("A", "edit");
    usePanesStore.getState().setPaneViewMode("B", "preview");
    const [a, b] = usePanesStore.getState().panes;
    expect(componentFor(a!.viewMode)).toBe("CodeEditor");
    expect(componentFor(b!.viewMode)).toBe("PreviewPane");
  });

  it("splitRatio stays inside the range EditorCard turns into CSS widths", () => {
    usePanesStore.getState().setSplitRatio(0.35);
    const r = usePanesStore.getState().splitRatio;
    expect(r).toBe(0.35);
    // EditorCard renders `${r * 100}%` and `${(1 - r) * 100}%`.
    expect(r * 100 + (1 - r) * 100).toBeCloseTo(100, 10);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(1);
  });

  it("PreviewPane never receives a null tabId (EditorCard coerces to \"\")", () => {
    usePanesStore.getState().setPaneViewMode("A", "preview");
    const pane = usePanesStore.getState().getFocusedPane();
    expect(pane.tabId).toBeNull();
    // EditorCard: `<PreviewPane tabId={pane.tabId ?? ""} />`
    const passed = pane.tabId ?? "";
    expect(typeof passed).toBe("string");
    // ...and PreviewPane's lookup degrades to the empty document.
    const content = useTabsStore.getState().tabs.find((t) => t.id === passed)?.content ?? "";
    expect(content).toBe("");
  });
});

/* ------------------------------------------------------------------ *
 * ViewSwitcher — the two click handlers
 * ------------------------------------------------------------------ */

describe("ViewSwitcher — mode buttons", () => {
  it.each<ViewMode>(["edit", "live", "preview"])(
    "clicking %s switches the focused pane's view mode",
    (mode) => {
      const { focusedPaneId, setPaneViewMode } = usePanesStore.getState();
      setPaneViewMode(focusedPaneId, mode);
      expect(usePanesStore.getState().getFocusedPane().viewMode).toBe(mode);
    },
  );

  it("only touches the focused pane, never its neighbour", () => {
    splitToggle();
    usePanesStore.getState().setPaneViewMode("A", "live");
    usePanesStore.getState().setPaneViewMode("B", "preview");

    focusPane("B");
    const { focusedPaneId, setPaneViewMode } = usePanesStore.getState();
    expect(focusedPaneId).toBe("B");
    setPaneViewMode(focusedPaneId, "edit");

    expect(usePanesStore.getState().getPane("A")?.viewMode).toBe("live");
    expect(usePanesStore.getState().getPane("B")?.viewMode).toBe("edit");
  });

  it("the highlighted segment follows the focused pane", () => {
    splitToggle();
    usePanesStore.getState().setPaneViewMode("A", "edit");
    usePanesStore.getState().setPaneViewMode("B", "preview");

    // `usePanesStore((s) => s.getFocusedPane().viewMode)`
    expect(usePanesStore.getState().getFocusedPane().viewMode).toBe("edit");
    focusPane("B");
    expect(usePanesStore.getState().getFocusedPane().viewMode).toBe("preview");
  });
});

describe("ViewSwitcher — split button", () => {
  it("splits, mirrors A's document into B and persists the layout", () => {
    useTabsStore.getState().openTab({ path: "/a.md", name: "a.md", content: "# A" });
    const tabId = useTabsStore.getState().activeId!;
    usePanesStore.getState().setPaneTab("A", tabId);

    splitToggle();

    const s = usePanesStore.getState();
    expect(s.layout).toBe("split");
    expect(s.panes).toHaveLength(2);
    expect(s.panes[1]?.id).toBe("B");
    expect(s.panes[1]?.tabId).toBe(tabId);
    expect(useConfigStore.getState().config.workspaceLayout).toBe("split");
  });

  it("takes pane B's view mode from config.paneViewModes[1]", () => {
    useConfigStore.setState({
      config: { ...useConfigStore.getState().config, paneViewModes: ["live", "edit"] },
    });
    splitToggle();
    expect(usePanesStore.getState().getPane("B")?.viewMode).toBe("edit");
  });

  it("toggles back to a single pane and persists that too", () => {
    splitToggle();
    expect(usePanesStore.getState().layout).toBe("split");

    splitToggle();

    const s = usePanesStore.getState();
    expect(s.layout).toBe("single");
    expect(s.panes).toHaveLength(1);
    expect(s.panes[0]?.id).toBe("A");
    expect(s.focusedPaneId).toBe("A");
    expect(useConfigStore.getState().config.workspaceLayout).toBe("single");
  });

  it("always drops pane B on exit, even when B has focus", () => {
    useTabsStore.getState().openTab({ path: "/a.md", name: "a.md", content: "A" });
    const a = useTabsStore.getState().activeId!;
    usePanesStore.getState().setPaneTab("A", a);
    splitToggle();

    useTabsStore.getState().openTab({ path: "/b.md", name: "b.md", content: "B" });
    const b = useTabsStore.getState().activeId!;
    usePanesStore.getState().setPaneTab("B", b);
    focusPane("B");
    expect(usePanesStore.getState().focusedPaneId).toBe("B");

    splitToggle(); // -> closePane("B"), survivor is always A

    const s = usePanesStore.getState();
    expect(s.layout).toBe("single");
    expect(s.panes).toHaveLength(1);
    expect(s.panes[0]?.id).toBe("A");
    expect(s.panes[0]?.tabId).toBe(a);
    expect(s.focusedPaneId).toBe("A");
    // paneRouter keeps `activeId` in step with the surviving pane.
    expect(useTabsStore.getState().activeId).toBe(a);
  });
});

/* ------------------------------------------------------------------ *
 * SettingsPanel — 默认视图 <select>
 * ------------------------------------------------------------------ */

/** Exactly what `SettingsPanel`'s onChange does. */
function chooseDefaultView(v: ViewMode): void {
  useConfigStore.getState().update({ defaultView: v });
  usePanesStore.getState().setPaneViewMode(usePanesStore.getState().focusedPaneId, v);
}

describe("SettingsPanel — 默认视图", () => {
  it.each<ViewMode>(["edit", "live", "preview"])(
    "persists %s and applies it to the focused pane immediately",
    (v) => {
      chooseDefaultView(v);
      expect(useConfigStore.getState().config.defaultView).toBe(v);
      expect(usePanesStore.getState().getFocusedPane().viewMode).toBe(v);
    },
  );

  it("applies to pane B when B has focus", () => {
    splitToggle();
    focusPane("B");
    chooseDefaultView("edit");
    expect(usePanesStore.getState().getPane("A")?.viewMode).toBe("live");
    expect(usePanesStore.getState().getPane("B")?.viewMode).toBe("edit");
  });

  it("no longer depends on the removed useUIStore.setViewMode", async () => {
    const ui = await import("../store/useUIStore");
    expect("setViewMode" in ui.useUIStore.getState()).toBe(false);
    expect("viewMode" in ui.useUIStore.getState()).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Workspace -> EditorCard (no tabId prop any more)
 * ------------------------------------------------------------------ */

describe("Workspace — EditorCard needs no props", () => {
  it("the document EditorCard shows comes from the pane, not from a prop", () => {
    openInFocusedPane({ path: "/x.md", name: "x.md", content: "x" });
    const tabId = useTabsStore.getState().activeId;
    expect(tabId).toBeTruthy();
    expect(usePanesStore.getState().getFocusedPane().tabId).toBe(tabId);
  });
});
