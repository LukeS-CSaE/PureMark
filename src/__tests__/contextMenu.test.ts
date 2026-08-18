/**
 * Unit tests for the right-click suppression rule (iter2-ext T05 / N-18, 需求2 更新).
 *
 * The actual capture-phase listener is installed by `App.tsx` and would need
 * jsdom to exercise end-to-end. The *decision* — "should this target be
 * suppressed?" — is a pure function on `EventTarget`, so we test it directly
 * with a tiny `Element` mock that implements just enough of `closest()` to
 * emulate the selectors the rule checks (含 parent 链以模拟 DOM 嵌套).
 *
 * v3 strategy: suppress EVERYWHERE, including <input> / <textarea> (需求2 / Q2).
 * => workspace / editor / file-tree / toolbar / settings / sidebar gaps /
 * live view (ProseMirror) / contenteditable / input / textarea are ALL
 * suppressed (true).
 */
import { describe, expect, it } from "vitest";
import { shouldSuppressContextMenu } from "../lib/contextMenuGuard";

interface ElNode {
  className: string;
  tag: string;
  isContentEditable: boolean;
  parent: ElNode | null;
  closest(sel: string): ElNode | null;
}

function classesOf(node: ElNode): string[] {
  return node.className.split(/\s+/).filter(Boolean);
}

/**
 * 最小 Element 桩。v3 策略下无任何豁免，input/textarea 也一律压制。
 * closest() 支持 parent 链向上查找，以模拟 DOM 嵌套。
 */
function makeEl(
  opts: { classes?: string[]; tag?: string; isContentEditable?: boolean },
  parent: ElNode | null = null,
): ElNode {
  const classes = opts.classes ?? [];
  const tag = opts.tag ?? "div";
  const ce = opts.isContentEditable === true;
  const self: ElNode = {
    className: classes.join(" "),
    tag,
    isContentEditable: ce,
    parent,
    closest(sel: string): ElNode | null {
      let node: ElNode | null = self;
      while (node) {
        for (const part of sel.split(",")) {
          const p = part.trim();
          if (p.startsWith(".")) {
            if (classesOf(node).includes(p.slice(1))) return node;
          } else if (["input", "textarea"].includes(p)) {
            if (node.tag === p) return node;
          } else if (p === "[contenteditable=\"true\"]") {
            if (node.isContentEditable) return node;
          }
        }
        node = node.parent;
      }
      return null;
    },
  };
  return self;
}

/** 将桩转换为 shouldSuppressContextMenu 接受的 EventTarget。 */
function target(
  opts: { classes?: string[]; tag?: string; isContentEditable?: boolean },
  parent?: ElNode | null,
): EventTarget {
  return makeEl(opts, parent ?? null) as unknown as EventTarget;
}

describe("shouldSuppressContextMenu", () => {
  it("returns false for a null target", () => {
    expect(shouldSuppressContextMenu(null)).toBe(false);
  });

  it("returns false for a non-Element target (e.g. window)", () => {
    expect(shouldSuppressContextMenu({} as EventTarget)).toBe(false);
  });

  // ---- 默认压制：应用内任意内容区域都应为 true（即便不在旧白名单里）----

  it("suppresses targets inside .app-workspace", () => {
    expect(shouldSuppressContextMenu(target({ classes: ["app-workspace"] }))).toBe(true);
  });

  it("suppresses targets inside .editor-pane", () => {
    expect(shouldSuppressContextMenu(target({ classes: ["editor-pane"] }))).toBe(true);
  });

  it("suppresses targets inside .file-tree", () => {
    expect(shouldSuppressContextMenu(target({ classes: ["file-tree"] }))).toBe(true);
  });

  it("suppresses targets inside the toolbar (.app-header)", () => {
    expect(shouldSuppressContextMenu(target({ classes: ["app-header"] }))).toBe(true);
  });

  it("suppresses right-clicks on a toolbar button (.app-header > button)", () => {
    const btn = target(
      { tag: "button" },
      makeEl({ classes: ["app-header"] }),
    );
    expect(shouldSuppressContextMenu(btn)).toBe(true);
  });

  it("suppresses targets inside the settings panel (.settings-body)", () => {
    expect(shouldSuppressContextMenu(target({ classes: ["settings-body"] }))).toBe(true);
  });

  it("suppresses right-clicks on empty sidebar areas (.app-sidebar)", () => {
    expect(shouldSuppressContextMenu(target({ classes: ["app-sidebar"] }))).toBe(true);
  });

  it("suppresses right-clicks on empty file-scroll areas (.file-scroll)", () => {
    expect(shouldSuppressContextMenu(target({ classes: ["file-scroll"] }))).toBe(true);
  });

  it("suppresses targets inside .pm-live", () => {
    expect(shouldSuppressContextMenu(target({ classes: ["pm-live"] }))).toBe(true);
  });

  it("suppresses targets inside the ProseMirror live view (.ProseMirror)", () => {
    expect(shouldSuppressContextMenu(target({ classes: ["ProseMirror"] }))).toBe(true);
  });

  // ---- contenteditable 现在不再豁免（被压制）----

  it("suppresses targets inside [contenteditable=\"true\"] (no longer exempt)", () => {
    expect(shouldSuppressContextMenu(target({ isContentEditable: true }))).toBe(true);
  });

  // ---- 需求2 / Q2：input / textarea 也一并被压制（无原生菜单）----

  it("suppresses targets inside <input> (native menu disabled per Q2)", () => {
    expect(shouldSuppressContextMenu(target({ tag: "input" }))).toBe(true);
  });

  it("suppresses targets inside <textarea>", () => {
    expect(shouldSuppressContextMenu(target({ tag: "textarea" }))).toBe(true);
  });

  // ---- CodeMirror：被本 guard 压制，自定义菜单由 CM 自己弹 ----

  it("suppresses .cm-editor when nested inside .editor-pane", () => {
    const editor = target({ classes: ["cm-editor"] }, makeEl({ classes: ["editor-pane"] }));
    expect(shouldSuppressContextMenu(editor)).toBe(true);
  });

  it("suppresses .cm-content nested inside .app-workspace", () => {
    const content = target(
      { classes: ["cm-content"] },
      makeEl({ classes: ["editor-pane"] }, makeEl({ classes: ["app-workspace"] })),
    );
    expect(shouldSuppressContextMenu(content)).toBe(true);
  });

  it("suppresses a standalone .cm-editor (v2 suppresses by default)", () => {
    expect(shouldSuppressContextMenu(target({ classes: ["cm-editor"] }))).toBe(true);
  });

  it("suppresses the settings panel region (v2 suppresses by default)", () => {
    expect(shouldSuppressContextMenu(target({ classes: ["settings-panel"] }))).toBe(true);
  });
});
