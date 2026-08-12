/**
 * REGRESSION — "the document a pane shows" wiring (QA, round 1).
 *
 * Before iter2, `Workspace` handed `EditorCard` a `tabId` derived from
 * `useTabsStore.activeId`, so anything that moved `activeId` was immediately
 * visible in the editor. After the iter2 UI migration `EditorCard` renders
 * `usePanesStore.panes[i].tabId` instead, and `pane.tabId` is only ever written
 * by `src/lib/paneRouter.ts`.
 *
 * That makes the paneRouter invariant load-bearing for *every* entry point that
 * can open or activate a document:
 *
 *     useTabsStore.activeId === usePanesStore.getFocusedPane().tabId
 *
 * These tests drive the store calls each entry point actually makes today and
 * assert the invariant afterwards. A failure here means the corresponding UI
 * action puts a document in the tab strip that the editor never shows.
 *
 * Entry points covered:
 *   • Toolbar 「打开文件」 -> `useTabsStore.getState().openTab(...)`
 *   • Toolbar 「新建」     -> `useTabsStore.getState().newUntitled()`
 *   • Sidebar FileTree    -> `openTab(...)`
 *   • TabBar click        -> `useTabsStore.setActive(id)`
 *   • Ctrl+N hotkey       -> `useTabsStore.getState().newUntitled()`
 *   • File association    -> `openInFocusedPane(...)` (paneRouter)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
const { openInFocusedPane, activateTabInFocusedPane, newUntitledInFocusedPane } = await import(
  "../lib/paneRouter"
);

function reset(): void {
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

/**
 * Assert the invariant documented at the top of `src/lib/paneRouter.ts`.
 * Compares the two ids directly so a failure reports which document the tab
 * strip thinks is active vs. what the pane (and therefore the editor) shows.
 */
function expectFocusedPaneShowsActiveTab(): void {
  const activeId = useTabsStore.getState().activeId;
  const paneTabId = usePanesStore.getState().getFocusedPane().tabId;
  expect(paneTabId).toBe(activeId);
}

beforeEach(reset);

/* ------------------------------------------------------------------ *
 * Helpers for the "components delegate to paneRouter" block
 * ------------------------------------------------------------------ */

type Elem = { props?: Record<string, unknown> } | null | undefined | string | number | boolean;

/** Depth-first walk over a React element tree (elements are never rendered). */
function walk(node: unknown, visit: (el: { props: Record<string, unknown> }) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
    return;
  }
  if (!node || typeof node !== "object") return;
  const el = node as { props?: Record<string, unknown> };
  if (!el.props) return;
  visit(el as { props: Record<string, unknown> });
  walk(el.props.children, visit);
}

/** Find the element whose `prop` equals `value` and fire its `onClick`. */
function clickByProp(tree: Elem, prop: string, value: string): void {
  let handler: (() => void) | undefined;
  walk(tree, (el) => {
    if (handler) return;
    if (el.props[prop] === value && typeof el.props.onClick === "function") {
      handler = el.props.onClick as () => void;
    }
  });
  if (!handler) throw new Error(`no clickable element with ${prop}="${value}"`);
  handler();
}

/**
 * Import `Toolbar` in an isolated module registry with `paneRouter` and the
 * stores replaced by spies, then hand back a `render()` that simply *calls* the
 * component (legal here: every hook it uses is one of our plain-function fakes).
 */
async function loadToolbarWithSpies() {
  const newUntitledInFocusedPaneSpy = vi.fn();
  const openInFocusedPaneSpy = vi.fn();
  const rawNewUntitled = vi.fn();
  const rawOpenTab = vi.fn();

  const uiState = {
    setSearchOpen: vi.fn(),
    setConfigOpen: vi.fn(),
    sidebarVisible: true,
    toggleSidebar: vi.fn(),
    setSidebarMode: vi.fn(),
  };
  const tabsState = { newUntitled: rawNewUntitled, openTab: rawOpenTab, saveActive: vi.fn() };

  // iter2-ext Toolbar reads tocVisible / tocPosition and calls update({...})
  // from useConfigStore. The real Zustand store would invoke
  // useSyncExternalStore under React (legal in production, not legal here
  // because Toolbar is invoked as a plain function), so mock it with the same
  // selector+getState pattern as useUIStore / useTabsStore. Every iter2-ext
  // AppConfig field must be present or a selector will return undefined and
  // crash downstream — see the bug-fix that originally brought these fields in.
  const configState: {
    config: typeof DEFAULT_CONFIG;
    update: ReturnType<typeof vi.fn>;
  } = {
    config: {
      ...DEFAULT_CONFIG,
      window: { ...DEFAULT_CONFIG.window },
      recentFiles: [],
      // iter2-ext additions (configVersion 3):
      accent: "sky",
      accentCustom: null,
      tocVisible: false,
      tocPosition: "right",
      tocWidth: 220,
      autoSave: true,
      autoSaveDelay: 800,
    },
    update: vi.fn(),
  };

  vi.resetModules();
  vi.doMock("../lib/paneRouter", () => ({
    newUntitledInFocusedPane: newUntitledInFocusedPaneSpy,
    openInFocusedPane: openInFocusedPaneSpy,
  }));
  vi.doMock("../store/useUIStore", () => ({
    useUIStore: Object.assign((sel: (s: typeof uiState) => unknown) => sel(uiState), {
      getState: () => uiState,
    }),
  }));
  vi.doMock("../store/useTabsStore", () => ({
    useTabsStore: Object.assign((sel: (s: typeof tabsState) => unknown) => sel(tabsState), {
      getState: () => tabsState,
    }),
  }));
  vi.doMock("../store/useConfigStore", () => ({
    useConfigStore: Object.assign(
      (sel: (s: typeof configState) => unknown) => sel(configState),
      { getState: () => configState },
    ),
    DEFAULT_CONFIG,
  }));

  const Toolbar = (await import("../components/Workspace/Toolbar")).default;

  return {
    render: () => (Toolbar as unknown as () => Elem)(),
    newUntitledInFocusedPane: newUntitledInFocusedPaneSpy,
    rawNewUntitled,
  };
}

/** Same trick for `TabBar`, which renders one row per open tab. */
async function loadTabBarWithSpies() {
  const activateTabInFocusedPaneSpy = vi.fn();
  const rawSetActive = vi.fn();

  const tabsState = {
    tabs: [{ id: "t1", name: "a.md", dirty: false }],
    activeId: "t1",
    setActive: rawSetActive,
  };

  vi.resetModules();
  vi.doMock("../lib/paneRouter", () => ({
    activateTabInFocusedPane: activateTabInFocusedPaneSpy,
  }));
  vi.doMock("../lib/closeGuard", () => ({ requestCloseTab: vi.fn() }));
  vi.doMock("../store/useTabsStore", () => ({
    useTabsStore: Object.assign((sel: (s: typeof tabsState) => unknown) => sel(tabsState), {
      getState: () => tabsState,
    }),
  }));

  const TabBar = (await import("../components/Workspace/TabBar")).default;

  return {
    render: () => (TabBar as unknown as () => Elem)(),
    activateTabInFocusedPane: activateTabInFocusedPaneSpy,
    rawSetActive,
  };
}

/** Drop the per-test module mocks so the rest of the file keeps the real ones. */
function restoreModules(): void {
  vi.doUnmock("../lib/paneRouter");
  vi.doUnmock("../lib/closeGuard");
  vi.doUnmock("../store/useUIStore");
  vi.doUnmock("../store/useTabsStore");
  vi.doUnmock("../store/useConfigStore");
  vi.resetModules();
}

describe("paneRouter entry points keep the editor in sync", () => {
  it("openInFocusedPane puts the document in the focused pane", () => {
    openInFocusedPane({ path: "/a.md", name: "a.md", content: "# A" });
    expect(useTabsStore.getState().activeId).toBeTruthy();
    expectFocusedPaneShowsActiveTab();
  });

  it("newUntitledInFocusedPane puts the draft in the focused pane", () => {
    newUntitledInFocusedPane();
    expect(useTabsStore.getState().activeId).toBeTruthy();
    expectFocusedPaneShowsActiveTab();
  });

  it("activateTabInFocusedPane moves the focused pane onto the tab", () => {
    openInFocusedPane({ path: "/a.md", name: "a.md", content: "A" });
    const a = useTabsStore.getState().activeId!;
    openInFocusedPane({ path: "/b.md", name: "b.md", content: "B" });

    activateTabInFocusedPane(a);

    expect(useTabsStore.getState().activeId).toBe(a);
    expectFocusedPaneShowsActiveTab();
  });
});

describe("component entry points keep the editor in sync", () => {
  it("Toolbar 「打开文件」 shows the opened file in the editor", () => {
    // src/components/Workspace/Toolbar.tsx::handleOpen -> openInFocusedPane(...)
    openInFocusedPane({ path: "/opened.md", name: "opened.md", content: "hi" });

    expect(useTabsStore.getState().activeId).toBeTruthy();
    expectFocusedPaneShowsActiveTab();
  });

  it("Toolbar 「新建」 shows the new draft in the editor", () => {
    // src/components/Workspace/Toolbar.tsx::handleNew -> newUntitledInFocusedPane()
    newUntitledInFocusedPane();

    expect(useTabsStore.getState().activeId).toBeTruthy();
    expectFocusedPaneShowsActiveTab();
  });

  it("Sidebar FileTree click shows the picked file in the editor", () => {
    // src/components/Sidebar/FileTree.tsx::handleOpenFile -> openInFocusedPane(...)
    openInFocusedPane({ path: "/tree.md", name: "tree.md", content: "tree" });

    expect(useTabsStore.getState().activeId).toBeTruthy();
    expectFocusedPaneShowsActiveTab();
  });

  it("Ctrl+N shows the new draft in the editor", () => {
    // src/hooks/useHotkeys.ts -> newUntitledInFocusedPane()
    newUntitledInFocusedPane();

    expect(useTabsStore.getState().activeId).toBeTruthy();
    expectFocusedPaneShowsActiveTab();
  });

  it("TabBar click switches the editor to the clicked tab", () => {
    openInFocusedPane({ path: "/a.md", name: "a.md", content: "A" });
    const a = useTabsStore.getState().activeId!;
    openInFocusedPane({ path: "/b.md", name: "b.md", content: "B" });

    // src/components/Workspace/TabBar.tsx onClick -> activateTabInFocusedPane(...)
    activateTabInFocusedPane(a);

    expect(useTabsStore.getState().activeId).toBe(a);
    expectFocusedPaneShowsActiveTab();
  });
});

/**
 * The block above asserts the *contract* each component relies on, but it calls
 * `paneRouter` directly — so it would stay green even if a component regressed
 * to a raw `useTabsStore` call (exactly the P0 found in round 1).
 *
 * These tests close that hole: the component is invoked for real and we assert
 * it reached `paneRouter`. `Toolbar` and `TabBar` read their state through
 * zustand selectors only, so with the stores mocked as plain functions they are
 * ordinary functions returning an element tree — no DOM, no React renderer, no
 * new dependency. Walking that tree lets us fire the very `onClick` a user
 * would.
 *
 * `FileTree` (real `useState`) and `useHotkeys` (real `useEffect` + `window`)
 * cannot be driven this way without jsdom; they remain covered by the contract
 * block plus manual review.
 */
describe("components delegate to paneRouter (P0 regression guard)", () => {
  afterEach(restoreModules);

  it("Toolbar 「新建」 button calls newUntitledInFocusedPane, not useTabsStore", async () => {
    const spies = await loadToolbarWithSpies();
    const tree = spies.render();

    clickByProp(tree, "title", "新建");

    expect(spies.newUntitledInFocusedPane).toHaveBeenCalledTimes(1);
    expect(spies.rawNewUntitled).not.toHaveBeenCalled();
  });

  it("TabBar item click calls activateTabInFocusedPane, not useTabsStore.setActive", async () => {
    const spies = await loadTabBarWithSpies();
    const tree = spies.render();

    clickByProp(tree, "className", "tab-item active");

    expect(spies.activateTabInFocusedPane).toHaveBeenCalledWith("t1");
    expect(spies.rawSetActive).not.toHaveBeenCalled();
  });
});
