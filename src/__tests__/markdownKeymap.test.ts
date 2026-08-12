import { describe, it, expect } from "vitest";
import { EditorState, EditorSelection, type Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { markdownFormatKeymap } from "../lib/cm/markdownKeymap";

/**
 * Run a named keymap command against a doc+selection and return the new doc.
 *
 * The commands call `dispatch(state.update(spec))` internally, so the
 * `dispatch` callback receives a fully-built `Transaction` — we capture it and
 * read its `.newDoc` directly (rather than re-applying `state.update`).
 */
function run(bindingKey: string, doc: string, selFrom: number, selTo = selFrom): string {
  const cmd = markdownFormatKeymap.find((b) => b.key === bindingKey)?.run;
  if (!cmd) throw new Error(`no binding for ${bindingKey}`);
  const state = EditorState.create({
    doc,
    selection: EditorSelection.range(selFrom, selTo),
  });
  let tx: Transaction | null = null;
  const view = {
    state,
    dispatch: (t: Transaction) => {
      tx = t;
    },
  } as unknown as EditorView;
  const ok = cmd(view) as boolean;
  expect(ok).toBe(true);
  expect(tx).not.toBeNull();
  return (tx as unknown as Transaction).newDoc.toString();
}

describe("markdown format keymap", () => {
  it("Ctrl+B wraps a selection in ** and toggles off on repeat", () => {
    expect(run("Mod-b", "hello world", 0, 5)).toBe("**hello** world");
    expect(run("Mod-b", "**hello** world", 0, 9)).toBe("hello world");
  });

  it("Ctrl+B toggles off when the selection sits inside the markers (real-app path)", () => {
    // After a wrap the cursor lands on the inner text "hello" (2..7).
    expect(run("Mod-b", "**hello** world", 2, 7)).toBe("hello world");
  });

  it("Ctrl+I wraps in single *", () => {
    expect(run("Mod-i", "word", 0, 4)).toBe("*word*");
  });

  it("Ctrl+Shift+X wraps in ~~ (strikethrough)", () => {
    expect(run("Shift-Mod-x", "old", 0, 3)).toBe("~~old~~");
  });

  it("Ctrl+E wraps inline code in backticks", () => {
    expect(run("Mod-e", "x=1", 0, 3)).toBe("`x=1`");
  });

  it("Ctrl+Alt+2 adds a level-2 heading, same key removes it", () => {
    expect(run("Mod-Alt-2", "Title", 0)).toBe("## Title");
    expect(run("Mod-Alt-2", "## Title", 0)).toBe("Title");
  });

  it("Ctrl+Alt+0 removes an existing heading of any level", () => {
    expect(run("Mod-Alt-0", "### Heading", 0)).toBe("Heading");
  });

  it("Ctrl+K wraps selection as a link and selects the URL", () => {
    const doc = run("Mod-k", "text", 0, 4);
    expect(doc).toBe("[text](url)");
  });

  it("Ctrl+K toggles off when the selection sits inside an existing link", () => {
    // After wrapping, selection lands on "url" (7..10) inside [text](url).
    expect(run("Mod-k", "[text](url)", 7, 10)).toBe("text");
  });
});
