/**
 * Pure text transformations for the formatting toolbar. Each command takes the
 * full document text and the current selection, and returns the new text plus
 * the new selection range so the editor can restore the caret.
 */
import type { FormatCommand } from "../types";

export interface TextSelection {
  start: number;
  end: number;
}

export interface FormatResult {
  text: string;
  selStart: number;
  selEnd: number;
}

/** Bounds (in the source) of the full line range covering a selection. */
function lineRange(
  value: string,
  sel: TextSelection,
): { start: number; end: number } {
  const start = sel.start === 0 ? 0 : value.lastIndexOf("\n", sel.start - 1) + 1;
  let end = value.indexOf("\n", sel.end);
  if (end === -1) end = value.length;
  return { start, end };
}

/** Wrap the selection with `before`/`after` (placeholder if nothing selected). */
function wrap(
  value: string,
  sel: TextSelection,
  before: string,
  after: string,
  placeholder: string,
): FormatResult {
  const selected = value.slice(sel.start, sel.end) || placeholder;
  const text = value.slice(0, sel.start) + before + selected + after + value.slice(sel.end);
  const selStart = sel.start + before.length;
  const selEnd = selStart + selected.length;
  return { text, selStart, selEnd };
}

/** Apply `transform` to every line in the selection's line range. */
function transformLines(
  value: string,
  sel: TextSelection,
  transform: (line: string, index: number) => string,
): FormatResult {
  const { start, end } = lineRange(value, sel);
  const before = value.slice(0, start);
  const region = value.slice(start, end);
  const after = value.slice(end);
  const newRegion = region
    .split("\n")
    .map((line, i) => transform(line, i))
    .join("\n");
  return { text: before + newRegion + after, selStart: start, selEnd: start + newRegion.length };
}

const STRIP_HEADING = /^#{1,6}\s*/;
const STRIP_ORDERED = /^\d+\.\s*/;
const STRIP_TASK = /^- \[[ xX]\] \s*/;

/** Apply a formatting command to the given text + selection. */
export function applyFormat(
  command: FormatCommand,
  value: string,
  sel: TextSelection,
): FormatResult {
  switch (command) {
    case "h1":
      return transformLines(value, sel, (l) => "# " + l.replace(STRIP_HEADING, ""));
    case "h2":
      return transformLines(value, sel, (l) => "## " + l.replace(STRIP_HEADING, ""));
    case "h3":
      return transformLines(value, sel, (l) => "### " + l.replace(STRIP_HEADING, ""));
    case "bold":
      return wrap(value, sel, "**", "**", "粗体");
    case "italic":
      return wrap(value, sel, "*", "*", "斜体");
    case "strike":
      return wrap(value, sel, "~~", "~~", "删除线");
    case "code":
      return wrap(value, sel, "`", "`", "代码");
    case "link":
      return wrap(value, sel, "[", "](url)", "链接文本");
    case "image":
      return wrap(value, sel, "![", "](url)", "图片描述");
    case "quote":
      return transformLines(value, sel, (l) => (l.startsWith("> ") ? l : "> " + l));
    case "ul":
      return transformLines(value, sel, (l) =>
        l.startsWith("- ") || l.startsWith("* ") ? l : "- " + l,
      );
    case "ol":
      return transformLines(value, sel, (_l, i) => `${i + 1}. ` + _l.replace(STRIP_ORDERED, ""));
    case "task":
      return transformLines(value, sel, (l) =>
        l.startsWith("- [ ] ") ? l : "- [ ] " + l.replace(STRIP_TASK, ""),
      );
    case "table": {
      const table =
        "| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n" +
        "| 单元格 | 单元格 | 单元格 |\n| 单元格 | 单元格 | 单元格 |";
      const text = value.slice(0, sel.start) + table + value.slice(sel.end);
      return { text, selStart: sel.start, selEnd: sel.start + table.length };
    }
    default:
      return { text: value, selStart: sel.start, selEnd: sel.end };
  }
}
