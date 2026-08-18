/**
 * Render tests for `EditorCard` / `ViewSwitcher` (QA, round 1).
 *
 * `@testing-library/react` + jsdom are not installed here and QA may not add
 * dependencies, so the components are rendered with `react-dom/server`'s
 * `renderToStaticMarkup`. That is enough to assert *structure*:
 *
 *   • which child component a pane resolves to (`.code-editor` vs
 *     `data-view="preview"` — preview now shares the TipTap `.pm-live`
 *     surface with the live view, so it is told apart by a data attribute);
 *   • how many `.editor-split` columns a split layout produces and what width
 *     each one gets from `splitRatio`;
 *   • which ViewSwitcher segment is marked `aria-pressed`.
 *
 * Effects never run under SSR, which is exactly what we want here: CodeMirror
 * is created inside a `useEffect`, so no DOM is required.
 *
 * Two harness details worth knowing:
 *
 *  1. `usePanesStore` is replaced with a hand-rolled fake. zustand 4.5.x feeds
 *     `api.getServerState || api.getInitialState` to `useSyncExternalStore`
 *     during server rendering, so a real store would hand every selector the
 *     *initial* state no matter what `setState` was called with. (This only
 *     affects SSR — the app itself renders on the client, where the snapshot is
 *     `getState`.) The fake lets each test pin an exact pane layout.
 *  2. JSX is avoided (`React.createElement`) so the file stays a `.test.ts` and
 *     is picked up by the existing `include: ["src/**\/*.test.ts"]` glob — no
 *     vitest config change needed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Pane, ViewMode, WorkspaceLayout } from "../types";

vi.mock("../lib/tauri", () => ({
  storeGet: vi.fn(async () => null),
  storeSet: vi.fn(async () => undefined),
}));

vi.mock("../commands/fsCommands", () => ({
  readFileText: vi.fn(async () => ""),
  readFileTextWithEncoding: vi.fn(async () => ({ content: "", encoding: "utf-8", hadBom: false })),
  writeFileText: vi.fn(async () => undefined),
  writeFileTextWithEncoding: vi.fn(async () => undefined),
  openFileDialog: vi.fn(async () => null),
  openFolderDialog: vi.fn(async () => null),
  saveFileDialog: vi.fn(async () => null),
  readDirTree: vi.fn(async () => []),
}));

/* ---- controllable stand-in for usePanesStore ---------------------------- */

interface FakePanesState {
  layout: WorkspaceLayout;
  panes: Pane[];
  focusedPaneId: string;
  splitRatio: number;
  getFocusedPane(): Pane;
  getPane(id: string): Pane | undefined;
  setPaneViewMode(id: string, m: ViewMode): void;
  setPaneCursor(): void;
  setPaneScroll(): void;
}

const setPaneViewMode = vi.fn();

let paneState: FakePanesState;

function makePane(id: string, viewMode: ViewMode, tabId: string | null = null): Pane {
  return { id: id as Pane["id"], tabId, viewMode, cursor: { line: 1, col: 1 }, scrollTop: 0 };
}

function setPanes(
  layout: WorkspaceLayout,
  panes: Pane[],
  focusedPaneId = "A",
  splitRatio = 0.5,
): void {
  paneState = {
    layout,
    panes,
    focusedPaneId,
    splitRatio,
    getFocusedPane: () => panes.find((p) => p.id === focusedPaneId) ?? panes[0]!,
    getPane: (id: string) => panes.find((p) => p.id === id),
    setPaneViewMode,
    setPaneCursor: () => {},
    setPaneScroll: () => {},
  };
}

setPanes("single", [makePane("A", "live")]);

vi.mock("../store/usePanesStore", () => {
  const hook = (selector?: (s: FakePanesState) => unknown) =>
    selector ? selector(paneState) : paneState;
  return {
    usePanesStore: Object.assign(hook, {
      getState: () => paneState,
      setState: () => {},
      subscribe: () => () => {},
    }),
  };
});

const EditorCard = (await import("../components/Workspace/EditorCard")).default;
const ViewSwitcher = (await import("../components/Workspace/ViewSwitcher")).default;

const count = (html: string, needle: string): number => html.split(needle).length - 1;

beforeEach(() => {
  setPaneViewMode.mockClear();
  setPanes("single", [makePane("A", "live")]);
});

/* ------------------------------------------------------------------------ */

describe("EditorCard — single layout", () => {
  // 统一视图重构后：preview / live 均为 MarkdownView（ProseMirror）；edit 在
  // CM 关闭（默认）时合并进 live（同样 MarkdownView）。data-view 标记：
  // preview→"preview"，可编辑→"live"。仅开启 useCodeMirrorSource 后 edit 才
  // 独立渲染 CodeEditor（data-view="edit"，class="code-editor"）。
  it.each([
    ["edit" as const, 0, 0, 1],
    ["live" as const, 0, 0, 1],
    ["preview" as const, 0, 1, 0],
  ])(
    "viewMode %s renders %i CodeEditor / %i preview / %i live",
    (mode, editors, previews, lives) => {
      setPanes("single", [makePane("A", mode)]);
      const html = renderToStaticMarkup(createElement(EditorCard));
      expect(count(html, 'class="code-editor"')).toBe(editors);
      expect(count(html, 'data-view="preview"')).toBe(previews);
      expect(count(html, 'data-view="live"')).toBe(lives);
    },
  );

  it("emits no split columns and keeps the toolbar above the pane", () => {
    const html = renderToStaticMarkup(createElement(EditorCard));
    expect(count(html, "editor-split")).toBe(0);
    expect(html).toContain('class="editor-pane"');
    expect(html.indexOf("toolbar")).toBeLessThan(html.indexOf("editor-pane"));
  });

});

describe("EditorCard — split layout", () => {
  it("renders two side-by-side columns", () => {
    setPanes("split", [makePane("A", "edit"), makePane("B", "preview")]);
    const html = renderToStaticMarkup(createElement(EditorCard));
    expect(count(html, 'class="editor-split"')).toBe(2);
  });

  it("renders both panes' components at once, left pane first (edit merges to live)", () => {
    setPanes("split", [makePane("A", "edit"), makePane("B", "preview")]);
    const html = renderToStaticMarkup(createElement(EditorCard));
    expect(count(html, 'class="code-editor"')).toBe(0);
    expect(count(html, 'data-view="live"')).toBe(1);
    expect(count(html, 'data-view="preview"')).toBe(1);
    expect(html.indexOf('data-view="live"')).toBeLessThan(html.indexOf('data-view="preview"'));
  });

  it("renders two editable views when both panes are editable (live/live)", () => {
    setPanes("split", [makePane("A", "edit"), makePane("B", "live")]);
    const html = renderToStaticMarkup(createElement(EditorCard));
    expect(count(html, 'data-view="live"')).toBe(2);
    expect(count(html, 'data-view="preview"')).toBe(0);
  });

  it("renders two previews when both panes are in preview", () => {
    setPanes("split", [makePane("A", "preview"), makePane("B", "preview")]);
    const html = renderToStaticMarkup(createElement(EditorCard));
    expect(count(html, 'data-view="preview"')).toBe(2);
    expect(count(html, 'class="code-editor"')).toBe(0);
  });

  /**
   * `flex-basis`, not `width`: `.editor-split` carries `flex: 1 1 50%` in
   * `layout.css`, and that shorthand's 50% basis wins over an inline `width` in
   * a flex row — so the ratio had no visual effect until it moved to
   * `flex-basis` (P2-1). The two bases sum to 100%, leaving `flex-grow: 1` with
   * no free space to redistribute.
   */
  it("turns splitRatio into complementary column bases", () => {
    setPanes("split", [makePane("A", "edit"), makePane("B", "preview")], "A", 0.7);
    const html = renderToStaticMarkup(createElement(EditorCard));
    const bases = [...html.matchAll(/style="flex-basis:([\d.]+)%"/g)].map((m) => Number(m[1]));
    expect(bases).toHaveLength(2);
    expect(bases[0]).toBeCloseTo(70, 6);
    expect(bases[1]).toBeCloseTo(30, 6);
    expect(bases[0]! + bases[1]!).toBeCloseTo(100, 6);
  });

  it("never emits an inline width that layout.css would ignore", () => {
    setPanes("split", [makePane("A", "edit"), makePane("B", "preview")], "A", 0.7);
    const html = renderToStaticMarkup(createElement(EditorCard));
    expect(html).not.toMatch(/style="width:/);
  });

  it("defaults to an even 50/50 split", () => {
    setPanes("split", [makePane("A", "edit"), makePane("B", "preview")], "A", 0.5);
    const html = renderToStaticMarkup(createElement(EditorCard));
    expect(count(html, 'style="flex-basis:50%"')).toBe(2);
  });

  it("rounds the basis so no float noise reaches the DOM", () => {
    setPanes("split", [makePane("A", "edit"), makePane("B", "preview")], "A", 0.7);
    const html = renderToStaticMarkup(createElement(EditorCard));
    expect(html).toContain("flex-basis:30%");
    expect(html).not.toContain("30.000000000000004");
  });

  it("still renders the left column when pane B is missing", () => {
    setPanes("split", [makePane("A", "edit")]);
    const html = renderToStaticMarkup(createElement(EditorCard));
    expect(count(html, 'class="editor-split"')).toBe(2);
    // edit 合并进 live（CM 关闭）→ 一个可编辑 MarkdownView。
    expect(count(html, 'data-view="live"')).toBe(1);
  });
});

describe("ViewSwitcher — rendered segments", () => {
  // 默认 useCodeMirrorSource=false → 仅「实时 / 预览」两个视图段（编辑合并进 live）。
  it("renders one button per enabled view mode (edit hidden unless CM source on)", () => {
    const html = renderToStaticMarkup(createElement(ViewSwitcher));
    expect(count(html, "<button")).toBe(2);
    expect(html).not.toContain('aria-label="编辑"');
    expect(html).toContain('aria-label="实时"');
    expect(html).toContain('aria-label="预览"');
  });

  it("marks the focused pane's mode as pressed", () => {
    setPanes("single", [makePane("A", "preview")]);
    const html = renderToStaticMarkup(createElement(ViewSwitcher));
    expect(html).toMatch(/aria-label="预览"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/aria-label="实时"[^>]*aria-pressed="false"/);
  });

  it("follows the focused pane, not pane A, in a split layout", () => {
    setPanes("split", [makePane("A", "edit"), makePane("B", "preview")], "B");
    const html = renderToStaticMarkup(createElement(ViewSwitcher));
    // edit 在 CM 关闭时映射为高亮的 live。
    expect(html).toMatch(/aria-label="预览"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/aria-label="实时"[^>]*aria-pressed="false"/);
  });
});
