/**
 * `useToc` — outline data for a single pane (iter2-ext N-13).
 *
 * Follows the focused pane: it reads the pane's tab id from `usePanesStore`
 * and the document text from `useTabsStore`, then parses it with `parseToc`.
 *
 * Debounce rule (design §3.3):
 *   • content edits         -> wait 200ms before re-parsing (typing is high
 *                              frequency; re-parsing on every keystroke is waste)
 *   • paneId / tabId change -> re-parse IMMEDIATELY so the outline never shows
 *                              a stale document for ~200ms after switching files
 *
 * The live Markdown source is pulled from the pane's `TocAdapter.getMarkdown()`
 * when registered (so a CodeMirror pane reflects uncommitted edits), falling
 * back to the store content otherwise.
 */
import { useEffect, useRef, useState } from "react";
import type { PaneId, TocItem, TocPosition } from "../types";
import { useUIStore } from "../store/useUIStore";
import { useConfigStore } from "../store/useConfigStore";
import { usePanesStore } from "../store/usePanesStore";
import { useTabsStore } from "../store/useTabsStore";
import { parseToc } from "../lib/toc";
import { getTocAdapter } from "../lib/tocRegistry";
import { jumpToHeading } from "../lib/tocRouter";

export interface TocState {
  /** Headings of the current document, in order. */
  items: TocItem[];
  /** Jump to a heading (focuses the pane, then scrolls it). */
  jump: (item: TocItem) => void;
  /** Whether the outline should be shown for this pane right now. */
  visible: boolean;
  /** Configured outline position. */
  position: TocPosition;
}

const DEBOUNCE_MS = 200;

export function useToc(paneId: PaneId): TocState {
  const sidebarMode = useUIStore((s) => s.sidebarMode);
  const tocVisible = useConfigStore((s) => s.config.tocVisible);
  const tocPosition = useConfigStore((s) => s.config.tocPosition);

  const tabId = usePanesStore(
    (s) => s.panes.find((p) => p.id === paneId)?.tabId ?? null,
  );
  const content = useTabsStore((s) =>
    tabId ? (s.tabs.find((t) => t.id === tabId)?.content ?? "") : "",
  );

  const [items, setItems] = useState<TocItem[]>([]);
  const debounceRef = useRef<number | null>(null);
  const prevRef = useRef<{ paneId?: PaneId; tabId?: string | null }>({});

  useEffect(() => {
    const compute = () => {
      const adapter = getTocAdapter(paneId);
      const md = adapter ? adapter.getMarkdown() : content;
      setItems(parseToc(md));
    };

    const switched =
      prevRef.current.paneId !== paneId || prevRef.current.tabId !== tabId;
    if (switched) {
      compute();
    } else {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(compute, DEBOUNCE_MS);
    }

    prevRef.current = { paneId, tabId };
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [paneId, tabId, content]);

  // Visibility combines the persisted toggle with the sidebar shape (§3.3):
  //   • right position -> always visible when tocVisible (standalone panel)
  //   • left position   -> visible only when the sidebar is in 'toc' mode
  const visible =
    tocVisible &&
    (tocPosition === "right" || (tocPosition === "left" && sidebarMode === "toc"));

  const jump = (item: TocItem) => jumpToHeading(paneId, item);

  return { items, jump, visible, position: tocPosition };
}
