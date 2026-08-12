/**
 * Unit tests for the right-click suppression rule (iter2-ext T05 / N-18).
 *
 * The actual capture-phase listener is installed by `App.tsx` and would need
 * jsdom to exercise end-to-end. The *decision* — "should this target be
 * suppressed?" — is a pure function on `EventTarget`, so we test it directly
 * with a tiny `Element` mock that implements just enough of `closest()` to
 * emulate the selectors the rule checks.
 */
import { describe, expect, it } from "vitest";
import { shouldSuppressContextMenu } from "../lib/contextMenuGuard";

/**
 * Minimal Element stub. `closest` resolves class-only and tag-only selectors
 * (the two shapes the rule actually uses); anything else returns `null`.
 */
function makeEl(opts: {
  classes?: string[];
  tag?: string;
  isContentEditable?: boolean;
}): Element {
  const classes = opts.classes ?? [];
  const tag = opts.tag ?? "div";
  const ce = opts.isContentEditable === true;
  const self: Element = {
    className: classes.join(" "),
    closest(sel: string): Element | null {
      for (const part of sel.split(",")) {
        const p = part.trim();
        if (p.startsWith(".")) {
          if (classes.includes(p.slice(1))) return self;
        } else if (["input", "textarea", "button", "select"].includes(p)) {
          if (tag === p) return self;
        } else if (p === "[contenteditable]") {
          if (ce) return self;
        } else if (p === ".cm-content" || p === ".cm-editor") {
          if (classes.includes(p.slice(1))) return self;
        }
      }
      return null;
    },
  } as unknown as Element;
  return self;
}

describe("shouldSuppressContextMenu", () => {
  it("returns false for a null target", () => {
    expect(shouldSuppressContextMenu(null)).toBe(false);
  });

  it("returns false for a non-Element target (e.g. window)", () => {
    expect(shouldSuppressContextMenu({} as EventTarget)).toBe(false);
  });

  it("suppresses targets inside .app-workspace", () => {
    expect(shouldSuppressContextMenu(makeEl({ classes: ["app-workspace"] }))).toBe(true);
  });

  it("suppresses targets inside .editor-pane", () => {
    expect(shouldSuppressContextMenu(makeEl({ classes: ["editor-pane"] }))).toBe(true);
  });

  it("suppresses targets inside .file-tree", () => {
    expect(shouldSuppressContextMenu(makeEl({ classes: ["file-tree"] }))).toBe(true);
  });

  it("suppresses targets inside .preview-content", () => {
    expect(shouldSuppressContextMenu(makeEl({ classes: ["preview-content"] }))).toBe(true);
  });

  it("does NOT suppress targets inside <input> (paste still works)", () => {
    expect(shouldSuppressContextMenu(makeEl({ tag: "input" }))).toBe(false);
  });

  it("does NOT suppress targets inside <textarea>", () => {
    expect(shouldSuppressContextMenu(makeEl({ tag: "textarea" }))).toBe(false);
  });

  it("does NOT suppress targets inside [contenteditable]", () => {
    expect(shouldSuppressContextMenu(makeEl({ isContentEditable: true }))).toBe(false);
  });

  it("does NOT suppress targets inside .cm-editor (CodeMirror host)", () => {
    expect(shouldSuppressContextMenu(makeEl({ classes: ["cm-editor"] }))).toBe(false);
  });

  it("does NOT suppress targets inside .cm-content", () => {
    expect(shouldSuppressContextMenu(makeEl({ classes: ["cm-content"] }))).toBe(false);
  });

  it("does NOT suppress an unrelated element (e.g. a settings menu)", () => {
    expect(shouldSuppressContextMenu(makeEl({ classes: ["settings-panel"] }))).toBe(false);
  });
});