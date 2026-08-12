/**
 * TOC jump orchestration — iter2-ext N-07 / N-16.
 *
 * The ONLY place that turns a `TocItem` click into a pane focus + scroll. It
 * mirrors the `paneRouter` contract (shared knowledge S-4 / S-3): navigation
 * side effects must flow through the dedicated router, never through a
 * component poking the stores directly. `jumpToHeading` therefore:
 *   1. focuses the target pane via `paneRouter.focusPane` (keeps the
 *      `focusedPaneId` / `activeId` invariant in sync), then
 *   2. asks the pane's registered `TocAdapter` to scroll to the heading.
 *
 * It does NOT write `useUIStore.sidebarMode` / `useConfigStore.toc*` itself —
 * those are driven by the toggle / position actions wired in T04.
 */
import type { PaneId, TocItem } from "../types";
import { focusPane } from "./paneRouter";
import { getTocAdapter } from "./tocRegistry";
import { usePanesStore } from "../store/usePanesStore";
import { findHeadingEl } from "./headingAnchors";

/**
 * Focus `paneId` and scroll it to `item`'s heading.
 *
 * Branches on the target pane's viewMode (iter2-ext T05):
 *
 *   • `preview` — focus the pane, look up the rendered heading element by id
 *     and `scrollIntoView({block: 'start'})`. The DOM may not be mounted yet
 *     (outline click during a tab swap), in which case the call is a safe
 *     no-op after the focus step.
 *   • `edit` / `live` — original CodeMirror path via `TocAdapter.scrollToHeading`,
 *     which handles the line→offset conversion internally.
 *   • unknown pane — fall back to `focusPane` only.
 */
export function jumpToHeading(paneId: PaneId, item: TocItem): void {
  const pane = usePanesStore.getState().getPane(paneId);
  if (!pane) return;

  if (pane.viewMode === "preview") {
    focusPane(paneId);
    const rootEl = document.querySelector<HTMLElement>(
      `[data-pane-id="${paneId}"].preview-content`,
    );
    if (!rootEl) return;
    const headingEl = findHeadingEl(rootEl, item.id);
    if (headingEl) headingEl.scrollIntoView({ block: "start" });
    return;
  }

  // edit / live — CodeMirror path.
  const adapter = getTocAdapter(paneId);
  if (!adapter) return;
  focusPane(paneId);
  adapter.scrollToHeading(item.line);
}
