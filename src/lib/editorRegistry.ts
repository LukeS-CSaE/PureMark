/**
 * Editor handle registry (design §1.3 / §8.5) — replaces the MVP
 * `editorBridge.ts`, whose "one global textarea" assumption breaks with two
 * simultaneously mounted panes.
 *
 * Only panes rendering an *editable* view (`edit` / `live`) register a handle;
 * `preview` panes never do, so `getFocusedEditor()` can legitimately return
 * `null` and every caller must handle that branch.
 */
import type { Cursor, PaneId } from "../types";
import { usePanesStore } from "../store/usePanesStore";

export interface EditorHandle {
  readonly paneId: string;
  readonly tabId: string | null;
  /** Full document text (always plain Markdown — R-06). */
  getValue(): string;
  /** Current selection as 0-based character offsets, `start <= end`. */
  getSelection(): { start: number; end: number };
  /** Select a range, focus the editor and scroll it into view. */
  setSelection(start: number, end: number): void;
  /** Replace `[from, to)` with `insert`, optionally restoring a selection. */
  replaceRange(
    from: number,
    to: number,
    insert: string,
    select?: { start: number; end: number },
  ): void;
  /** 1-based caret line/column. */
  getCursor(): Cursor;
  focus(): void;
  /** Scroll a character offset into view without changing the selection. */
  scrollToOffset(offset: number): void;
  /**
   * Scroll a source line into view (search jump). `match` carries markdown
   * offsets; `ordinal` is the match's 0-based index among all matches. CM6
   * `edit` uses the exact `match` offsets to select + scroll; PM-based
   * `live` / `preview` use `ordinal` to locate the exact occurrence (markdown
   * offset ≠ PM position) and scroll it into view.
   */
  scrollToLine(lineNo: number, match?: { start: number; end: number }, ordinal?: number): void;
}

const handles = new Map<string, EditorHandle>();

/** Register (or replace) the handle for a pane. */
export function registerEditor(paneId: string, h: EditorHandle): void {
  handles.set(paneId, h);
}

/** Remove a pane's handle. Safe to call for an unknown pane. */
export function unregisterEditor(paneId: string): void {
  handles.delete(paneId);
}

/** Look up a pane's handle, or `null` when the pane has no editable view. */
export function getEditor(paneId: string): EditorHandle | null {
  return handles.get(paneId) ?? null;
}

/**
 * Handle of the currently focused pane, or `null` when that pane is in
 * `preview` mode (or nothing is mounted yet).
 */
export function getFocusedEditor(): EditorHandle | null {
  const paneId = usePanesStore.getState().focusedPaneId;
  return handles.get(paneId) ?? null;
}

/**
 * Graceful degradation for R-28 / A-8: the focused pane first, otherwise any
 * other editable pane. Returns `null` when no pane can be edited.
 */
export function getFocusedOrAnyEditor(): EditorHandle | null {
  const focused = getFocusedEditor();
  if (focused) return focused;
  for (const h of handles.values()) return h;
  return null;
}

/**
 * All handles showing `tabId`, excluding `excludePaneId`. Used by `useDocSync`
 * to forward transactions to the peer pane in a same-file split (R-10).
 */
export function getPeerEditors(tabId: string, excludePaneId: string): EditorHandle[] {
  const out: EditorHandle[] = [];
  for (const [id, h] of handles) {
    if (id !== excludePaneId && h.tabId === tabId) out.push(h);
  }
  return out;
}

/** Test/debug helper: drop every registration. */
export function clearEditors(): void {
  handles.clear();
}

/** Narrow a string back to a `PaneId` (registry keys are always pane ids). */
export function asPaneId(id: string): PaneId {
  return id === "B" ? "B" : "A";
}
