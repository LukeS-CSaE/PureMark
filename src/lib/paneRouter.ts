/**
 * Pane router (design §1.2) — the ONLY entry point for "open / focus / split /
 * close pane" actions.
 *
 * Why it exists: `useTabsStore.activeId` and `usePanesStore.focusedPaneId`
 * describe the same thing from two angles ("which document is active" vs
 * "which pane is focused"). Letting components mutate either one directly makes
 * them drift apart. Every mutation that can change *both* is funnelled through
 * this module, which guarantees the invariant:
 *
 *     useTabsStore.activeId === usePanesStore.getFocusedPane().tabId
 *
 * Components MUST NOT call `useTabsStore.setActive` / `openTab` /
 * `usePanesStore.setLayout` directly.
 */
import type { PaneId, ViewMode } from "../types";
import { useConfigStore } from "../store/useConfigStore";
import { usePanesStore } from "../store/usePanesStore";
import { useTabsStore } from "../store/useTabsStore";

export interface OpenFileInput {
  /** Absolute path; empty string for an untitled document. */
  path: string;
  name: string;
  content: string;
  /** 文件原始编码（非 UTF-8 中文文档由读取层检测，保存时按原编码写回）。 */
  encoding?: string;
  /** 原文件是否带 BOM。 */
  hadBom?: boolean;
}

/** Mirror the focused pane's document into `useTabsStore.activeId`. */
function syncActiveIdFromFocusedPane(): void {
  const tabId = usePanesStore.getState().getFocusedTabId();
  const tabs = useTabsStore.getState();
  if (tabId && tabId !== tabs.activeId) {
    tabs.setActive(tabId);
  }
}

/**
 * Open (or re-activate) a document inside the currently focused pane.
 * The other pane is never touched — this is what makes "focus B, click file in
 * the sidebar, only B changes" work (R-11).
 */
export function openInFocusedPane(file: OpenFileInput): void {
  const tabs = useTabsStore.getState();
  tabs.openTab(file);
  // `openTab` sets `activeId` to the new (or pre-existing) tab.
  const tabId = useTabsStore.getState().activeId;
  if (!tabId) return;
  const panes = usePanesStore.getState();
  panes.setPaneTab(panes.focusedPaneId, tabId);
}

/** Create a fresh untitled document in the focused pane. */
export function newUntitledInFocusedPane(): void {
  useTabsStore.getState().newUntitled();
  const tabId = useTabsStore.getState().activeId;
  if (!tabId) return;
  const panes = usePanesStore.getState();
  panes.setPaneTab(panes.focusedPaneId, tabId);
}

/**
 * Activate an already-open tab inside the focused pane (TabBar clicks).
 */
export function activateTabInFocusedPane(tabId: string): void {
  const exists = useTabsStore.getState().tabs.some((t) => t.id === tabId);
  if (!exists) return;
  const panes = usePanesStore.getState();
  panes.setPaneTab(panes.focusedPaneId, tabId);
  useTabsStore.getState().setActive(tabId);
}

/** Move the workspace focus to `paneId` and mirror its document into `activeId`. */
export function focusPane(paneId: PaneId): void {
  const panes = usePanesStore.getState();
  if (!panes.getPane(paneId)) return;
  if (panes.focusedPaneId !== paneId) {
    panes.setFocusedPane(paneId);
  }
  syncActiveIdFromFocusedPane();
}

/**
 * Toggle between the single-pane and two-pane layouts (R-09).
 * When splitting, pane B mirrors pane A's document (same buffer) and takes its
 * render mode from `config.paneViewModes[1]`.
 */
export function splitToggle(): void {
  setSplit(usePanesStore.getState().layout !== "split");
}

/**
 * Drive the single/split layout from an explicit desired state (used by the
 * settings panel toggle). Mirrors the behaviour of `splitToggle`: splitting
 * mirrors pane A's document into B and persists the choice; collapsing keeps
 * the focused pane.
 */
export function setSplit(enabled: boolean): void {
  const panes = usePanesStore.getState();
  if (enabled) {
    if (panes.layout === "split") return;
    const cfg = useConfigStore.getState().config;
    const modeB: ViewMode = cfg.paneViewModes?.[1] ?? "preview";
    panes.setLayout("split");
    const after = usePanesStore.getState();
    const a = after.getPane("A");
    after.setPaneTab("B", a?.tabId ?? null);
    after.setPaneViewMode("B", modeB);
  } else {
    if (panes.layout !== "split") return;
    const survivor: PaneId = panes.focusedPaneId === "B" ? "B" : "A";
    panes.setFocusedPane(survivor);
    panes.setLayout("single");
    syncActiveIdFromFocusedPane();
  }
  useConfigStore.getState().update({
    workspaceLayout: enabled ? "split" : "single",
  });
}

/**
 * Remove one pane and collapse back to a single-pane layout. Focus moves to the
 * surviving pane, which is always re-labelled `A`.
 */
export function closePane(paneId: PaneId): void {
  const panes = usePanesStore.getState();
  if (panes.layout !== "split") return;

  const survivor: PaneId = paneId === "A" ? "B" : "A";
  if (!panes.getPane(survivor)) return;

  // `setLayout('single')` keeps the *focused* pane, so point focus at the
  // survivor first.
  panes.setFocusedPane(survivor);
  usePanesStore.getState().setLayout("single");
  syncActiveIdFromFocusedPane();
  useConfigStore.getState().update({ workspaceLayout: "single" });
}

/**
 * Release every pane that references `tabId` (called after a tab is closed).
 * Panes fall back to any other open document; if none is left they show the
 * empty state. When only one pane still holds a document the workspace
 * collapses back to `single` (PRD 4.3 boundary rule).
 */
export function detachTab(tabId: string): void {
  const panes = usePanesStore.getState();
  const affected = panes.panes.filter((p) => p.tabId === tabId);
  if (affected.length === 0) {
    syncActiveIdFromFocusedPane();
    return;
  }

  const fallbackId = useTabsStore.getState().activeId;
  for (const p of affected) {
    usePanesStore.getState().setPaneTab(p.id, fallbackId);
  }

  // If the document is gone entirely there is nothing left to split.
  if (!fallbackId && usePanesStore.getState().layout === "split") {
    usePanesStore.getState().setLayout("single");
    useConfigStore.getState().update({ workspaceLayout: "single" });
  }

  syncActiveIdFromFocusedPane();
}
