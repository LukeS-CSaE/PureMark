/**
 * Document synchronisation between a CodeMirror instance, the tab store and a
 * peer pane showing the same buffer (design §1.4, task T02 step 2.9).
 *
 * Three channels, all guarded by `syncAnnotation` so they can never loop:
 *
 *   ① **peer forwarding** (fast path) — the very `ChangeSet` the user produced
 *      is replayed into every other pane bound to the same `tabId`. CodeMirror
 *      maps that peer's selection and scroll offset through the change, so both
 *      panes keep independent carets without any extra bookkeeping (R-10).
 *   ② **write-back** — `useTabsStore.updateContent()` keeps the single source
 *      of truth (and therefore the dirty flag / autosave) unchanged from MVP.
 *   ③ **minimal-diff backfill** — when the store changes from a non-CodeMirror
 *      origin (draft restore, future external edits), the smallest possible
 *      replacement is dispatched instead of a full document swap, preserving
 *      caret, scroll and undo history.
 *
 * The hook also owns the `EditorHandle` registration lifecycle so that pane
 * mounting/unmounting can never leave a stale handle behind.
 */
import { useEffect, useRef } from "react";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import type { Cursor, PaneId } from "../types";
import { useTabsStore } from "../store/useTabsStore";
import {
  registerEditor,
  unregisterEditor,
  type EditorHandle,
} from "../lib/editorRegistry";
import { minimalChange } from "../lib/textDiff";
import { isSyncTransaction, syncAnnotation } from "../lib/cm/setup";

/* -------------------------------------------------------------------------- */
/* Live CodeMirror instances, keyed by pane                                    */
/* -------------------------------------------------------------------------- */

interface CmEntry {
  view: EditorView;
  tabId: string | null;
}

/**
 * Peer registry. Deliberately separate from `editorRegistry`: that module
 * exposes the *editor-agnostic* `EditorHandle` contract (§8.5) which has no
 * notion of a `ChangeSet`. Forwarding transactions needs the raw view, and only
 * this module is allowed to know that the editor happens to be CodeMirror.
 */
const cmViews = new Map<string, CmEntry>();

/** Raw view of a pane — used by tests and by the peer-forwarding channel. */
export function getCmView(paneId: string): EditorView | null {
  return cmViews.get(paneId)?.view ?? null;
}

/** Test helper: forget every registered view. */
export function clearCmViews(): void {
  cmViews.clear();
}

/* -------------------------------------------------------------------------- */
/* EditorHandle implementation backed by CodeMirror                            */
/* -------------------------------------------------------------------------- */

function clampOffset(view: EditorView, offset: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(view.state.doc.length, Math.floor(offset)));
}

function cursorAt(view: EditorView, pos: number): Cursor {
  const line = view.state.doc.lineAt(clampOffset(view, pos));
  return { line: line.number, col: pos - line.from + 1 };
}

/** Build the `EditorHandle` (design §8.5) for one CodeMirror instance. */
export function createEditorHandle(
  paneId: string,
  tabId: string | null,
  view: EditorView,
): EditorHandle {
  return {
    paneId,
    tabId,

    getValue(): string {
      return view.state.doc.toString();
    },

    getSelection(): { start: number; end: number } {
      const range = view.state.selection.main;
      return { start: range.from, end: range.to };
    },

    setSelection(start: number, end: number): void {
      const anchor = clampOffset(view, start);
      const head = clampOffset(view, end);
      view.dispatch({
        selection: { anchor, head },
        scrollIntoView: true,
        // Selection-only: carries the annotation for contract completeness;
        // the update listener ignores it anyway (it only reacts to doc changes).
        annotations: syncAnnotation.of(true),
      });
      view.focus();
    },

    replaceRange(
      from: number,
      to: number,
      insert: string,
      select?: { start: number; end: number },
    ): void {
      const start = clampOffset(view, from);
      const end = Math.max(start, clampOffset(view, to));
      view.dispatch({
        changes: { from: start, to: end, insert },
        selection: select
          ? { anchor: clampOffset(view, select.start), head: clampOffset(view, select.end) }
          : undefined,
        scrollIntoView: true,
        // `false`, NOT `true`: this is a genuine user edit routed through the
        // formatting engine / search-replace. Annotating it `true` would make
        // the update listener skip the store write-back and the peer forward,
        // silently desynchronising the document.
        annotations: syncAnnotation.of(false),
      });
      view.focus();
    },

    getCursor(): Cursor {
      return cursorAt(view, view.state.selection.main.head);
    },

    focus(): void {
      view.focus();
    },

    scrollToOffset(offset: number): void {
      view.dispatch({
        effects: EditorView.scrollIntoView(clampOffset(view, offset)),
        annotations: syncAnnotation.of(true),
      });
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                        */
/* -------------------------------------------------------------------------- */

export interface DocSyncApi {
  /** Wire this into the editor's `updateListener`. */
  onUpdate(update: ViewUpdate): void;
}

/**
 * Attach the three sync channels to `view`.
 *
 * @param view   the pane's CodeMirror instance, or `null` before it is mounted
 * @param tabId  the document currently shown in the pane
 * @param paneId the owning pane
 */
export function useDocSync(
  view: EditorView | null,
  tabId: string | null,
  paneId: PaneId,
): DocSyncApi {
  const tabIdRef = useRef<string | null>(tabId);
  tabIdRef.current = tabId;

  /** Last text this pane pushed into the store — lets ③ exit in O(1). */
  const lastPushedRef = useRef<string | null>(null);
  const handlerRef = useRef<(update: ViewUpdate) => void>(() => {});
  const apiRef = useRef<DocSyncApi>({
    onUpdate: (update) => handlerRef.current(update),
  });

  // ---- registry lifecycle (EditorHandle + peer view) ------------------------
  useEffect(() => {
    if (!view) return;
    cmViews.set(paneId, { view, tabId });
    registerEditor(paneId, createEditorHandle(paneId, tabId, view));
    return () => {
      cmViews.delete(paneId);
      unregisterEditor(paneId);
    };
  }, [view, tabId, paneId]);

  // ---- ① peer forwarding + ② write-back ------------------------------------
  useEffect(() => {
    handlerRef.current = (update: ViewUpdate): void => {
      if (!update.docChanged) return;
      // Anything the sync layer itself produced must stop here (design §8.1).
      if (update.transactions.some(isSyncTransaction)) return;

      const id = tabIdRef.current;
      if (!id) return;

      // ① replay the exact ChangeSet into every peer showing the same buffer
      for (const [otherPaneId, entry] of cmViews) {
        if (otherPaneId === paneId || entry.tabId !== id) continue;
        entry.view.dispatch({
          changes: update.changes,
          annotations: syncAnnotation.of(true),
        });
      }

      // ② single source of truth
      const text = update.state.doc.toString();
      lastPushedRef.current = text;
      useTabsStore.getState().updateContent(id, text);
    };
  });

  // ---- ③ minimal-diff backfill (store → view) -------------------------------
  useEffect(() => {
    if (!view || !tabId) return;
    lastPushedRef.current = null;

    const push = (content: string): void => {
      if (content === lastPushedRef.current) return;
      const change = minimalChange(view.state.doc.toString(), content);
      if (!change) return;
      lastPushedRef.current = content;
      view.dispatch({
        changes: change,
        annotations: syncAnnotation.of(true),
      });
    };

    const initial = useTabsStore.getState().tabs.find((tab) => tab.id === tabId);
    if (initial) push(initial.content);

    return useTabsStore.subscribe((state) => {
      const tab = state.tabs.find((candidate) => candidate.id === tabId);
      if (tab) push(tab.content);
    });
  }, [view, tabId]);

  return apiRef.current;
}
