/**
 * Split-view synchronized scrolling (Bug #2, design §1.5).
 *
 * Three scenarios govern when two panes share their scroll offset:
 *
 *   1. Same-file + edit/live + preview split  → bidirectional sync by ratio.
 *   2. Different files split                   → independent scrolling.
 *   3. Same-file + two edit/live (no preview)  → independent scrolling.
 *
 * The module is split into a pure decision layer (`shouldSyncScroll`,
 * `computeSyncedScrollTop`) and a thin DOM layer (`registerScrollPane`). The
 * DOM layer reads the live pane layout from `usePanesStore` at scroll time, so
 * sync follows the panes whether the user logs the editor or the preview first.
 *
 * `selfWritten` is a `WeakSet<HTMLElement>` that the DOM layer uses to swallow
 * the synthetic scroll event we just produced when we wrote `scrollTop` on the
 * other pane. Without it, the editor↔preview pair would loop on every frame.
 */
import type { PaneId, WorkspaceLayout } from "../types";
import { usePanesStore } from "../store/usePanesStore";

export type ScrollPaneKind = "editor" | "preview";

export interface ScrollPane {
  paneId: PaneId;
  kind: ScrollPaneKind;
  /** Scroll container — `view.scrollDOM` for the editor, the root `<div>` for the preview. */
  el: HTMLElement;
  /** Live tabId lookup so a registered pane sees tab swaps without re-registering. */
  getTabId: () => string | null;
}

/** Minimal shape `shouldSyncScroll` needs — deliberately `paneId`-free; the
 *  array position pins the pane id (`panes[0]` is A, `panes[1]` is B). */
export interface ScrollPaneDescriptor {
  tabId: string | null;
  kind: ScrollPaneKind;
}

export interface SyncDecision {
  sync: boolean;
  /** Pane id of the scroll event source in the canonical arrangement. */
  leader: string;
  /** Pane id of the scroll event target. */
  follower: string;
}

/**
 * Decide whether the two panes should sync scroll.
 *
 * Returns `null` when the panes scroll independently (scenario 2 or 3) or the
 * workspace is not split. When sync is required the leader is the editor pane
 * (the most common source — the user reads in the preview), but the actual
 * scroll event source is determined at runtime by whichever pane emitted the
 * scroll, so the result is still bidirectional.
 */
export function shouldSyncScroll(
  layout: WorkspaceLayout,
  panes: ReadonlyArray<ScrollPaneDescriptor>,
): SyncDecision | null {
  if (layout !== "split") return null;
  if (panes.length < 2) return null;
  const paneA = panes[0];
  const paneB = panes[1];
  if (!paneA || !paneB) return null;
  if (paneA.tabId === null || paneB.tabId === null) return null;
  if (paneA.tabId !== paneB.tabId) return null;
  // Scenario 1 needs exactly one editor + one preview.
  const paneAIsEditor = paneA.kind === "editor";
  const paneBIsEditor = paneB.kind === "editor";
  if (paneAIsEditor === paneBIsEditor) return null;
  const leader = paneAIsEditor ? "A" : "B";
  const follower = paneAIsEditor ? "B" : "A";
  return { sync: true, leader, follower };
}

/**
 * Map a source scroll position to a dest scroll position by ratio.
 *
 * ratio = sourceTop / (sourceScrollHeight - sourceClientHeight)
 * destTop = round(ratio * (destScrollHeight - destClientHeight))
 *
 * The function is intentionally defensive: when either side cannot scroll
 * (content shorter than the viewport) the meaningful answer is "top", so it
 * returns 0. The ratio is clamped to [0, 1] so a small layout glitch that
 * reports a transient out-of-range `scrollTop` never pushes the peer pane off
 * the end of its content.
 */
export function computeSyncedScrollTop(
  sourceTop: number,
  sourceScrollHeight: number,
  sourceClientHeight: number,
  destScrollHeight: number,
  destClientHeight: number,
): number {
  const sourceMax = sourceScrollHeight - sourceClientHeight;
  const destMax = destScrollHeight - destClientHeight;
  if (sourceMax <= 0) return 0;
  if (destMax <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, sourceTop / sourceMax));
  return Math.round(ratio * destMax);
}

const panes = new Map<PaneId, ScrollPane>();
const selfWritten = new WeakSet<HTMLElement>();

/**
 * Register a scroll pane.
 *
 * Returns the unregister function so callers can clean up on unmount. The
 * listener is `passive: true` because we never call `preventDefault` — the
 * browser can keep the scroll on the compositor thread.
 */
export function registerScrollPane(pane: ScrollPane): () => void {
  panes.set(pane.paneId, pane);

  const onScroll = (): void => {
    // The synthetic scroll event we just produced on the other pane must not
    // propagate back (would oscillate until RAF cleans the flag).
    if (selfWritten.has(pane.el)) return;

    const state = usePanesStore.getState();
    const layout = state.layout;
    const paneRecords: ScrollPaneDescriptor[] = state.panes.map((p) => ({
      tabId: p.tabId,
      kind: p.viewMode === "preview" ? "preview" : "editor",
    }));
    const decision = shouldSyncScroll(layout, paneRecords);
    if (!decision) return;

    // The other pane is the rest of the split — there are only two panes.
    const otherPaneId: PaneId = pane.paneId === "A" ? "B" : "A";
    const otherPane = panes.get(otherPaneId);
    if (!otherPane) return;
    // Guard against a tab swap that left one half of the pair out of sync.
    if (pane.getTabId() !== otherPane.getTabId()) return;

    const destTop = computeSyncedScrollTop(
      pane.el.scrollTop,
      pane.el.scrollHeight,
      pane.el.clientHeight,
      otherPane.el.scrollHeight,
      otherPane.el.clientHeight,
    );
    otherPane.el.scrollTop = destTop;
    selfWritten.add(otherPane.el);
    requestAnimationFrame(() => {
      selfWritten.delete(otherPane.el);
    });
  };

  pane.el.addEventListener("scroll", onScroll, { passive: true });

  return () => {
    pane.el.removeEventListener("scroll", onScroll);
    panes.delete(pane.paneId);
  };
}

/** Test/debug helper: drop every registration. */
export function clearScrollPanes(): void {
  panes.clear();
}
