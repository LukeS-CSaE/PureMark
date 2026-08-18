/**
 * Pure, DOM-free search utilities shared by the search panel (T02).
 *
 * Everything here operates on a plain `string` so it can be unit-tested under
 * vitest's `node` environment without jsdom. The active editor's text is
 * supplied by the caller via `useTabsStore`.
 */
import type { EditorHandle } from "./editorRegistry";

/** A single match inside a document. */
export interface SearchMatch {
  /** Inclusive start character offset within `content`. */
  start: number;
  /** Exclusive end character offset within `content` (start + query.length). */
  end: number;
  /** 1-based line number of the match. */
  lineNo: number;
  /** The full text of the line that contains the match (without the newline). */
  lineText: string;
  /** 0-based column where the match starts within `lineText`. */
  colStart: number;
  /** 0-based column where the match ends within `lineText`. */
  colEnd: number;
}

/**
 * Find every (case-insensitive) occurrence of `query` in `content`.
 *
 * @param content  The full document text.
 * @param query    The search term. Case-insensitive. Empty string => `[]`.
 * @returns Sorted matches (by ascending `start`), each with line context for
 *          highlighting in the result list.
 */
export function findMatches(content: string, query: string): SearchMatch[] {
  const result: SearchMatch[] = [];
  if (!query) return result;

  const haystack = content.toLowerCase();
  const needle = query.toLowerCase();
  const qlen = needle.length;

  let from = 0;
  for (;;) {
    const pos = haystack.indexOf(needle, from);
    if (pos === -1) break;

    const end = pos + qlen;

    // Line context for the snippet + highlight.
    const before = content.slice(0, pos);
    const lineNo = before.split("\n").length; // 1-based
    const lineStart = before.lastIndexOf("\n") + 1;
    const nextNl = content.indexOf("\n", lineStart);
    const lineText = content.slice(lineStart, nextNl === -1 ? content.length : nextNl);
    const colStart = pos - lineStart;
    const colEnd = end - lineStart;

    result.push({ start: pos, end, lineNo, lineText, colStart, colEnd });

    from = end;
    if (from >= haystack.length) break;
  }

  return result;
}

/**
 * Jump the focused (or any editable) editor to a search match.
 *
 * Order of operations (single dispatch for CM6 edit view):
 *   1. `scrollToLine` — for CM6 `edit` this is a single dispatch that BOTH
 *      selects the matched range AND scrolls it into view (selection +
 *      scrollIntoView effect in one transaction, preventing any intermediate
 *      CM6 state from triggering unwanted scroll overrides). For PM-based
 *      `live` / `preview` views it locates the match by `ordinal` (the match's
 *      index among all matches) and scrolls the block into view, then applies a
 *      ProseMirror decoration highlight.
 *   2. `focus` — activates the pane.
 *
 * The function is DOM-free and pure so it can be unit-tested under vitest's
 * `node` environment by passing a mock `EditorHandle`.
 *
 * @param editor  the editor handle (from `getPeerEditors()` or `getFocusedOrAnyEditor()`)
 * @param match   the match to jump to (`match.start` / `match.end` offsets)
 * @param ordinal the match's 0-based index among all matches (result-list
 *                index). PM-based views need it to pick the exact occurrence;
 *                CM6 ignores it (it already has exact `start`/`end` offsets).
 */
export function jumpToMatch(editor: EditorHandle, match: SearchMatch, ordinal: number): void {
  // scrollToLine 对 edit 视图已在单次 dispatch 内完成选中+滚动；
  // 对 live/preview 则按 ordinal 精确定位 + 滚动 + 高亮。
  editor.scrollToLine(match.lineNo, { start: match.start, end: match.end }, ordinal);
  editor.focus();
}
