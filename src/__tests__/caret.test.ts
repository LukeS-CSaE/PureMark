/**
 * Unit tests for `src/lib/caret.ts` (`lineColFromOffset`) — the textarea
 * `selectionStart` -> 1-based Ln/Col conversion shown in the status bar,
 * plus the `src/lib/editorBridge.ts` active-textarea registry.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { lineColFromOffset } from "../lib/caret";
import { getActiveTextarea, setActiveTextarea } from "../lib/editorBridge";

describe("lineColFromOffset — single line", () => {
  it("reports Ln 1, Col 1 for an empty document", () => {
    expect(lineColFromOffset("", 0)).toEqual({ line: 1, col: 1 });
  });

  it("reports Ln 1, Col 1 at the start of the document", () => {
    expect(lineColFromOffset("hello", 0)).toEqual({ line: 1, col: 1 });
  });

  it("reports the 1-based column inside a line", () => {
    expect(lineColFromOffset("hello", 3)).toEqual({ line: 1, col: 4 });
  });

  it("reports the end-of-line column", () => {
    expect(lineColFromOffset("hello", 5)).toEqual({ line: 1, col: 6 });
  });
});

describe("lineColFromOffset — multi-line", () => {
  const value = "one\ntwo\nthree";
  //             0123 4567 8...

  it.each([
    [0, 1, 1], // start of line 1
    [3, 1, 4], // end of line 1 (before the \n)
    [4, 2, 1], // start of line 2 (after the \n)
    [6, 2, 3], // middle of line 2
    [7, 2, 4], // end of line 2
    [8, 3, 1], // start of line 3
    [13, 3, 6], // end of document
  ])("offset %i -> Ln %i, Col %i", (offset, line, col) => {
    expect(lineColFromOffset(value, offset)).toEqual({ line, col });
  });

  it("puts the caret on the next line when it sits right after a newline", () => {
    expect(lineColFromOffset("a\n", 2)).toEqual({ line: 2, col: 1 });
  });

  it("handles consecutive blank lines", () => {
    const doc = "a\n\n\nb";
    expect(lineColFromOffset(doc, 2)).toEqual({ line: 2, col: 1 });
    expect(lineColFromOffset(doc, 3)).toEqual({ line: 3, col: 1 });
    expect(lineColFromOffset(doc, 4)).toEqual({ line: 4, col: 1 });
  });

  it("handles a document that starts with a newline", () => {
    expect(lineColFromOffset("\nabc", 0)).toEqual({ line: 1, col: 1 });
    expect(lineColFromOffset("\nabc", 1)).toEqual({ line: 2, col: 1 });
  });

  it("counts CJK characters as single columns", () => {
    expect(lineColFromOffset("你好世界", 2)).toEqual({ line: 1, col: 3 });
    expect(lineColFromOffset("中文\n第二行", 3)).toEqual({ line: 2, col: 1 });
  });

  it("agrees with the total line count of the document", () => {
    const doc = "l1\nl2\nl3\nl4";
    expect(lineColFromOffset(doc, doc.length).line).toBe(doc.split("\n").length);
  });
});

describe("lineColFromOffset — out-of-range offsets", () => {
  it("clamps an offset beyond the end of the document", () => {
    const doc = "abc";
    expect(lineColFromOffset(doc, 999)).toEqual({ line: 1, col: 4 });
  });

  it("never returns a line or column below 1", () => {
    const r = lineColFromOffset("abc\ndef", 0);
    expect(r.line).toBeGreaterThanOrEqual(1);
    expect(r.col).toBeGreaterThanOrEqual(1);
  });
});

describe("editorBridge — active textarea registry", () => {
  const fakeA = { id: "a" } as unknown as HTMLTextAreaElement;
  const fakeB = { id: "b" } as unknown as HTMLTextAreaElement;

  beforeEach(() => setActiveTextarea(null));

  it("starts empty after a reset", () => {
    expect(getActiveTextarea()).toBeNull();
  });

  it("stores and returns the registered textarea", () => {
    setActiveTextarea(fakeA);
    expect(getActiveTextarea()).toBe(fakeA);
  });

  it("replaces the previous registration (single active editor)", () => {
    setActiveTextarea(fakeA);
    setActiveTextarea(fakeB);
    expect(getActiveTextarea()).toBe(fakeB);
  });

  it("clears the registration on unmount/blur", () => {
    setActiveTextarea(fakeA);
    setActiveTextarea(null);
    expect(getActiveTextarea()).toBeNull();
  });
});
