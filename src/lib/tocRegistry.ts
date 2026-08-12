/**
 * TOC adapter registry — iter2-ext N-16.
 *
 * Orthogonal to `editorRegistry` (shared knowledge S-9): both are keyed by
 * `paneId`, but they live in different `Map`s and serve different hosts.
 * `preview` panes register a `TocAdapter` (so the outline can read their
 * Markdown and scroll the preview), yet deliberately NEVER register an
 * `EditorHandle` — iter2 §8.5's "preview has no editor handle" invariant stays
 * intact. A `CodeEditor` registers both.
 *
 * The adapter owns two responsibilities:
 *   • `getMarkdown()`        — current document text, so the outline can be
 *                             recomputed as the user types.
 *   • `scrollToHeading(line)` — jump to a heading given its 1-based line number
 *                             (CodeMirror uses `doc.line(n).from`; the preview
 *                             uses the heading index — both live in T05).
 *
 * Pure module: no React, no store, no Tauri. Unit-testable under node.
 */
import type { PaneId } from "../types";

/** What a pane exposes to the TOC subsystem. */
export interface TocAdapter {
  /** Latest document Markdown (always plain Markdown). */
  getMarkdown: () => string;
  /** Scroll the pane so `line` (1-based) is visible. */
  scrollToHeading: (line: number) => void;
}

const adapters = new Map<PaneId, TocAdapter>();

/** Register (or replace) the adapter for a pane. */
export function registerToc(paneId: PaneId, adapter: TocAdapter): void {
  adapters.set(paneId, adapter);
}

/** Remove a pane's adapter. Safe to call for an unknown pane. */
export function unregisterToc(paneId: PaneId): void {
  adapters.delete(paneId);
}

/** Look up a pane's adapter, or `undefined` when it has none registered. */
export function getTocAdapter(paneId: PaneId): TocAdapter | undefined {
  return adapters.get(paneId);
}

/** Test/debug helper: drop every registration. */
export function clearTocAdapters(): void {
  adapters.clear();
}
