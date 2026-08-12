/**
 * Unit tests for `src/lib/format.ts` — the 12 toolbar formatting commands.
 *
 * Every command is exercised in the two states the editor can be in:
 *   1. collapsed caret (nothing selected) -> placeholder / line prefix
 *   2. non-empty selection               -> wrap / transform the selection
 *
 * Assertions cover the produced text *and* the returned selection range,
 * because the editor restores the caret from `selStart`/`selEnd`.
 */
import { describe, expect, it } from "vitest";
import { applyFormat, type TextSelection } from "../lib/format";
import type { FormatCommand } from "../types";

const ALL_COMMANDS: FormatCommand[] = [
  "h1",
  "h2",
  "h3",
  "bold",
  "italic",
  "strike",
  "code",
  "ul",
  "ol",
  "task",
  "quote",
  "link",
  "image",
  "table",
];

/** Convenience: collapsed caret at `at`. */
const caret = (at: number): TextSelection => ({ start: at, end: at });
/** Convenience: selection range. */
const range = (start: number, end: number): TextSelection => ({ start, end });

/** The slice the editor will highlight after the command runs. */
function selectedAfter(r: { text: string; selStart: number; selEnd: number }): string {
  return r.text.slice(r.selStart, r.selEnd);
}

// ---------------------------------------------------------------------------
// Inline wrapping commands
// ---------------------------------------------------------------------------

describe("applyFormat — inline wrap commands (collapsed caret)", () => {
  const cases: Array<[FormatCommand, string, string]> = [
    ["bold", "**粗体**", "粗体"],
    ["italic", "*斜体*", "斜体"],
    ["strike", "~~删除线~~", "删除线"],
    ["code", "`代码`", "代码"],
    ["link", "[链接文本](url)", "链接文本"],
    ["image", "![图片描述](url)", "图片描述"],
  ];

  it.each(cases)(
    "%s inserts its placeholder into an empty document and selects it",
    (command, expectedText, expectedSelected) => {
      const result = applyFormat(command, "", caret(0));
      expect(result.text).toBe(expectedText);
      expect(selectedAfter(result)).toBe(expectedSelected);
    },
  );

  it.each(cases)("%s inserts at the caret inside existing text", (command, expectedText) => {
    // caret between "ab" and "cd"
    const result = applyFormat(command, "abcd", caret(2));
    expect(result.text).toBe("ab" + expectedText + "cd");
  });
});

describe("applyFormat — inline wrap commands (with selection)", () => {
  const value = "hello world";
  const sel = range(0, 5); // "hello"

  const cases: Array<[FormatCommand, string, number, number]> = [
    ["bold", "**hello** world", 2, 7],
    ["italic", "*hello* world", 1, 6],
    ["strike", "~~hello~~ world", 2, 7],
    ["code", "`hello` world", 1, 6],
    ["link", "[hello](url) world", 1, 6],
    ["image", "![hello](url) world", 2, 7],
  ];

  it.each(cases)("%s wraps the selection", (command, expectedText, selStart, selEnd) => {
    const result = applyFormat(command, value, sel);
    expect(result.text).toBe(expectedText);
    expect(result.selStart).toBe(selStart);
    expect(result.selEnd).toBe(selEnd);
    // The original selection stays selected (markers excluded).
    expect(selectedAfter(result)).toBe("hello");
  });

  it("wraps a selection in the middle of the document", () => {
    const result = applyFormat("bold", "hello world", range(6, 11));
    expect(result.text).toBe("hello **world**");
    expect(selectedAfter(result)).toBe("world");
  });

  it("keeps link/image target placeholder so the caret can jump to (url)", () => {
    expect(applyFormat("link", "PureMark", range(0, 8)).text).toBe("[PureMark](url)");
    expect(applyFormat("image", "logo", range(0, 4)).text).toBe("![logo](url)");
  });
});

// ---------------------------------------------------------------------------
// Heading commands
// ---------------------------------------------------------------------------

describe("applyFormat — headings", () => {
  it.each([
    ["h1", "# "],
    ["h2", "## "],
    ["h3", "### "],
  ] as Array<[FormatCommand, string]>)("%s prefixes the current line", (command, prefix) => {
    const result = applyFormat(command, "标题", caret(1));
    expect(result.text).toBe(prefix + "标题");
  });

  it("replaces an existing heading level instead of stacking markers", () => {
    expect(applyFormat("h1", "### old", caret(0)).text).toBe("# old");
    expect(applyFormat("h3", "# old", caret(0)).text).toBe("### old");
    // Applying the same heading twice is idempotent.
    const once = applyFormat("h2", "title", caret(0)).text;
    expect(applyFormat("h2", once, caret(0)).text).toBe("## title");
  });

  it("only touches the lines covered by the selection", () => {
    const value = "one\ntwo\nthree";
    // selection covers only "two"
    const result = applyFormat("h1", value, range(4, 7));
    expect(result.text).toBe("one\n# two\nthree");
  });

  it("applies to every line of a multi-line selection", () => {
    const value = "one\ntwo\nthree";
    const result = applyFormat("h2", value, range(0, value.length));
    expect(result.text).toBe("## one\n## two\n## three");
  });

  it("expands a partial selection to whole lines", () => {
    const value = "alpha\nbeta";
    // selection starts mid-word on line 1 and ends mid-word on line 2
    const result = applyFormat("h1", value, range(2, 7));
    expect(result.text).toBe("# alpha\n# beta");
  });
});

// ---------------------------------------------------------------------------
// Line-block commands: quote / ul / ol / task
// ---------------------------------------------------------------------------

describe("applyFormat — quote", () => {
  it("prefixes a single line", () => {
    expect(applyFormat("quote", "note", caret(0)).text).toBe("> note");
  });

  it("is idempotent for already-quoted lines", () => {
    expect(applyFormat("quote", "> note", caret(0)).text).toBe("> note");
  });

  it("quotes every line of a multi-line selection", () => {
    const value = "a\nb\nc";
    expect(applyFormat("quote", value, range(0, value.length)).text).toBe("> a\n> b\n> c");
  });

  it("leaves already-quoted lines untouched inside a mixed selection", () => {
    const value = "> a\nb";
    expect(applyFormat("quote", value, range(0, value.length)).text).toBe("> a\n> b");
  });
});

describe("applyFormat — unordered list", () => {
  it("prefixes a single line", () => {
    expect(applyFormat("ul", "item", caret(0)).text).toBe("- item");
  });

  it("does not double-prefix `-` or `*` bullets", () => {
    expect(applyFormat("ul", "- item", caret(0)).text).toBe("- item");
    expect(applyFormat("ul", "* item", caret(0)).text).toBe("* item");
  });

  it("bullets every line of a multi-line selection", () => {
    const value = "a\nb\nc";
    expect(applyFormat("ul", value, range(0, value.length)).text).toBe("- a\n- b\n- c");
  });
});

describe("applyFormat — ordered list", () => {
  it("numbers a single line as 1.", () => {
    expect(applyFormat("ol", "item", caret(0)).text).toBe("1. item");
  });

  it("numbers a multi-line selection sequentially", () => {
    const value = "a\nb\nc";
    expect(applyFormat("ol", value, range(0, value.length)).text).toBe("1. a\n2. b\n3. c");
  });

  it("renumbers instead of stacking existing numbers", () => {
    const value = "5. a\n9. b";
    expect(applyFormat("ol", value, range(0, value.length)).text).toBe("1. a\n2. b");
  });

  it("restarts numbering from the first line of the selection", () => {
    const value = "head\na\nb";
    const result = applyFormat("ol", value, range(5, value.length));
    expect(result.text).toBe("head\n1. a\n2. b");
  });
});

describe("applyFormat — task list", () => {
  it("prefixes a single line with an unchecked box", () => {
    expect(applyFormat("task", "todo", caret(0)).text).toBe("- [ ] todo");
  });

  it("is idempotent for an already-unchecked task", () => {
    expect(applyFormat("task", "- [ ] todo", caret(0)).text).toBe("- [ ] todo");
  });

  it("normalises a checked task back to unchecked without duplicating the marker", () => {
    const result = applyFormat("task", "- [x] done", caret(0));
    expect(result.text).toBe("- [ ] done");
    // regression guard: must not become "- [ ] - [x] done"
    expect(result.text).not.toContain("- [x]");
  });

  it("converts every line of a multi-line selection", () => {
    const value = "a\nb";
    expect(applyFormat("task", value, range(0, value.length)).text).toBe("- [ ] a\n- [ ] b");
  });
});

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

describe("applyFormat — table", () => {
  const result = applyFormat("table", "", caret(0));
  const rows = result.text.split("\n");

  it("emits a header row, a delimiter row and two body rows", () => {
    expect(rows).toHaveLength(4);
  });

  it("keeps the same column count on every row", () => {
    const cellCount = (row: string) =>
      row
        .split("|")
        .slice(1, -1) // drop the empty leading/trailing fragments
        .length;
    const counts = rows.map(cellCount);
    expect(counts).toEqual([3, 3, 3, 3]);
  });

  it("uses a valid GFM delimiter row", () => {
    expect(rows[1]).toMatch(/^\|(\s*:?-{3,}:?\s*\|)+$/);
  });

  it("selects the whole inserted table", () => {
    expect(selectedAfter(result)).toBe(result.text);
  });

  it("replaces the current selection", () => {
    const r = applyFormat("table", "XXX", range(0, 3));
    expect(r.text.startsWith("| ")).toBe(true);
    expect(r.text).not.toContain("XXX");
  });

  it("inserts at the caret without dropping surrounding text", () => {
    const r = applyFormat("table", "before\nafter", caret(7));
    expect(r.text.startsWith("before\n")).toBe(true);
    expect(r.text.endsWith("after")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Robustness
// ---------------------------------------------------------------------------

describe("applyFormat — robustness", () => {
  it.each(ALL_COMMANDS)("%s does not throw on an empty document", (command) => {
    expect(() => applyFormat(command, "", caret(0))).not.toThrow();
    const r = applyFormat(command, "", caret(0));
    expect(typeof r.text).toBe("string");
  });

  it.each(ALL_COMMANDS)("%s returns a selection range inside the new text", (command) => {
    const r = applyFormat(command, "sample text", range(0, 6));
    expect(r.selStart).toBeGreaterThanOrEqual(0);
    expect(r.selEnd).toBeGreaterThanOrEqual(r.selStart);
    expect(r.selEnd).toBeLessThanOrEqual(r.text.length);
  });

  it.each(ALL_COMMANDS)("%s never loses the trailing document content", (command) => {
    const r = applyFormat(command, "head\nTAILMARKER", caret(0));
    expect(r.text).toContain("TAILMARKER");
  });

  it("returns the input unchanged for an unknown command", () => {
    const r = applyFormat("nope" as FormatCommand, "abc", range(1, 2));
    expect(r).toEqual({ text: "abc", selStart: 1, selEnd: 2 });
  });

  it("handles a caret at the very end of the document", () => {
    const value = "line";
    expect(applyFormat("bold", value, caret(value.length)).text).toBe("line**粗体**");
    expect(applyFormat("h1", value, caret(value.length)).text).toBe("# line");
  });

  it("formats the first (empty) line when the document starts with a newline", () => {
    // Regression guard for the `lastIndexOf("\n", -1)` clamp in lineRange():
    // with the caret at offset 0 the *first* line must be formatted, not line 2.
    const value = "\nsecond";
    const r = applyFormat("h1", value, caret(0));
    expect(r.text).toBe("# \nsecond");
  });
});
