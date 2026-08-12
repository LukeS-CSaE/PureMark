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
 * Jump the focused (or any editable) CodeMirror 6 editor to a search match.
 *
 * This is the single source of truth for "scroll + focus to a match". It talks
 * to the live CM6 `EditorHandle` (see `editorRegistry.ts`) rather than the
 * legacy MVP textarea bridge, because in `live` / `edit` mode the editing
 * surface is a CodeMirror `EditorView`, not a `<textarea>` — so
 * `getActiveTextarea()` returns `null` there and a textarea-based jump silently
 * no-ops (search results / arrow keys would never move the caret or scroll).
 *
 * `EditorHandle.setSelection` already performs `scrollIntoView` + `focus()`;
 * we additionally call `focus()` to be explicit. The function is DOM-free and
 * pure so it can be unit-tested under vitest's `node` environment by passing a
 * mock `EditorHandle`.
 *
 * @param editor  the CM6 editor handle (from `getFocusedOrAnyEditor()`)
 * @param match   the match to jump to (`match.start` / `match.end` offsets)
 */
export function jumpToMatch(editor: EditorHandle, match: SearchMatch): void {
  editor.setSelection(match.start, match.end);
  editor.focus();
}
