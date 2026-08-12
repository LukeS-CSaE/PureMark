/**
 * Unit tests for the pure search helper `findMatches` (iter2-ext T02).
 *
 * Runs under vitest's `node` environment (no jsdom): `findMatches` only ever
 * touches plain strings, so no DOM is required.
 */
import { describe, expect, it, vi } from "vitest";
import type { EditorHandle } from "../lib/editorRegistry";
import { findMatches, jumpToMatch, type SearchMatch } from "../lib/search";

/** A minimal `EditorHandle` double that records `setSelection` / `focus`. */
function makeMockEditor(): EditorHandle & { setSelection: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> } {
  const setSelection = vi.fn();
  const focus = vi.fn();
  return {
    paneId: "A",
    tabId: "tab-1",
    getValue: vi.fn(() => ""),
    getSelection: vi.fn(() => ({ start: 0, end: 0 })),
    setSelection,
    replaceRange: vi.fn(),
    getCursor: vi.fn(),
    focus,
    scrollToOffset: vi.fn(),
  } as EditorHandle & { setSelection: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> };
}

describe("findMatches", () => {
  it("is case-insensitive", () => {
    const m = findMatches("Hello WORLD", "world");
    expect(m).toHaveLength(1);
    expect(m[0].start).toBe(6);
    expect(m[0].end).toBe(11);
    expect(m[0].lineNo).toBe(1);
    expect(m[0].lineText).toBe("Hello WORLD");
    expect(m[0].colStart).toBe(6);
    expect(m[0].colEnd).toBe(11);
  });

  it("accumulates every occurrence including across lines", () => {
    const content = "foo bar\nfoo baz foo";
    const m = findMatches(content, "foo");
    expect(m).toHaveLength(3);

    // 1st: line 1, offset 0..3
    expect(m[0].start).toBe(0);
    expect(m[0].end).toBe(3);
    expect(m[0].lineNo).toBe(1);
    expect(m[0].colStart).toBe(0);
    expect(m[0].colEnd).toBe(3);

    // 2nd: line 2 ("foo bar\n" = 8 chars), offset 8..11
    expect(m[1].start).toBe(8);
    expect(m[1].end).toBe(11);
    expect(m[1].lineNo).toBe(2);
    expect(m[1].colStart).toBe(0);
    expect(m[1].colEnd).toBe(3);

    // 3rd: line 2, "foo baz foo" -> last foo at offset 16..19
    expect(m[2].start).toBe(16);
    expect(m[2].end).toBe(19);
    expect(m[2].lineNo).toBe(2);
    expect(m[2].colStart).toBe(8);
    expect(m[2].colEnd).toBe(11);
  });

  it("returns [] for an empty query", () => {
    expect(findMatches("anything", "")).toEqual([]);
    expect(findMatches("", "")).toEqual([]);
  });

  it("computes lineNo / colStart / colEnd correctly on multi-line text", () => {
    const content = "alpha\nbeta gamma\ndelta eps";
    const m = findMatches(content, "ga");
    expect(m).toHaveLength(1);
    expect(m[0].lineNo).toBe(2);
    expect(m[0].lineText).toBe("beta gamma");
    // "beta " = 5 chars before "ga"
    expect(m[0].colStart).toBe(5);
    expect(m[0].colEnd).toBe(7);
    // offset math: "alpha\n".length === 6, +5 === 11
    expect(m[0].start).toBe("alpha\n".length + 5);
    expect(m[0].end).toBe("alpha\n".length + 7);
  });

  it("matches a query equal to a whole line", () => {
    const content = "one\ntwo\nthree";
    const m = findMatches(content, "two");
    expect(m).toHaveLength(1);
    expect(m[0].lineNo).toBe(2);
    expect(m[0].lineText).toBe("two");
    expect(m[0].colStart).toBe(0);
    expect(m[0].colEnd).toBe(3);
    expect(m[0].start).toBe("one\n".length);
    expect(m[0].end).toBe("one\n".length + 3);
  });

  it("returns no matches when the query is absent", () => {
    expect(findMatches("quick brown fox", "zebra")).toEqual([]);
  });
});

describe("jumpToMatch", () => {
  it("delegates to the CM6 EditorHandle (setSelection + focus), never a textarea", () => {
    // A representative match — offsets can be arbitrary; we only assert they
    // are forwarded verbatim to the editor handle.
    const match: SearchMatch = {
      start: 42,
      end: 47,
      lineNo: 5,
      lineText: "const pure = puremark",
      colStart: 11,
      colEnd: 16,
    };

    const editor = makeMockEditor();
    jumpToMatch(editor, match);

    // Core contract: jump goes through the live CM6 handle (setSelection), not
    // the legacy textarea bridge, and the editor is focused.
    expect(editor.setSelection).toHaveBeenCalledTimes(1);
    expect(editor.setSelection).toHaveBeenCalledWith(match.start, match.end);
    expect(editor.focus).toHaveBeenCalledTimes(1);
  });

  it("forwards every search result offset through the handle", () => {
    const matches = findMatches("alpha beta alpha gamma alpha", "alpha");
    expect(matches).toHaveLength(3);

    const editor = makeMockEditor();
    for (const m of matches) jumpToMatch(editor, m);

    expect(editor.setSelection).toHaveBeenCalledTimes(3);
    matches.forEach((m, i) => {
      expect(editor.setSelection).toHaveBeenNthCalledWith(i + 1, m.start, m.end);
    });
    expect(editor.focus).toHaveBeenCalledTimes(3);
  });
});
