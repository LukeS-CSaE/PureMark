/**
 * Workspace pane store (iter2, design §3.2).
 *
 * Owns the workspace layout (`single` / `split`), the pane array (1 or 2 slots,
 * array order == visual left-to-right order), the focused pane and the split
 * ratio. Deliberately separated from `useUIStore` because `cursor` / `scrollTop`
 * are high-frequency writes and panes have their own persistence + lifecycle.
 *
 * IMPORTANT: components must not call these mutators directly for open/focus/
 * split actions — go through `src/lib/paneRouter.ts` (design §8.2).
 */
import { create } from "zustand";
import type { AppConfig, Cursor, Pane, PaneId, ViewMode, WorkspaceLayout } from "../types";

export const MIN_SPLIT_RATIO = 0.2;
export const MAX_SPLIT_RATIO = 0.8;

/** Clamp a split ratio into the allowed range; non-finite input falls back to 0.5. */
export function clampSplitRatio(r: number): number {
  if (!Number.isFinite(r)) return 0.5;
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, r));
}

function makePane(id: PaneId, tabId: string | null, viewMode: ViewMode): Pane {
  return { id, tabId, viewMode, cursor: { line: 1, col: 1 }, scrollTop: 0 };
}

export interface PanesState {
  layout: WorkspaceLayout;
  /** Length 1 (single) or 2 (split). */
  panes: Pane[];
  focusedPaneId: PaneId;
  /** Left pane width ratio in [0.2, 0.8]. */
  splitRatio: number;

  getFocusedPane(): Pane;
  getPane(id: PaneId): Pane | undefined;
  getFocusedTabId(): string | null;

  setLayout(l: WorkspaceLayout): void;
  setFocusedPane(id: PaneId): void;
  setPaneTab(id: PaneId, tabId: string | null): void;
  setPaneViewMode(id: PaneId, m: ViewMode): void;
  setPaneCursor(id: PaneId, c: Cursor): void;
  setPaneScroll(id: PaneId, top: number): void;
  setSplitRatio(r: number): void;
  /** Initialise layout / panes from the persisted config at startup. */
  hydrate(cfg: AppConfig, initialTabId: string | null): void;
}

export const usePanesStore = create<PanesState>((set, get) => ({
  layout: "single",
  panes: [makePane("A", null, "live")],
  focusedPaneId: "A",
  splitRatio: 0.5,

  getFocusedPane() {
    const { panes, focusedPaneId } = get();
    return panes.find((p) => p.id === focusedPaneId) ?? panes[0];
  },

  getPane(id) {
    return get().panes.find((p) => p.id === id);
  },

  getFocusedTabId() {
    return get().getFocusedPane()?.tabId ?? null;
  },

  setLayout(l) {
    set((s) => {
      if (s.layout === l) return s;
      if (l === "split") {
        const a = s.panes.find((p) => p.id === "A") ?? makePane("A", null, "live");
        const existingB = s.panes.find((p) => p.id === "B");
        // A same-file split by default: B mirrors A's document (design §4.2 a).
        const b = existingB ?? makePane("B", a.tabId, "preview");
        return { layout: "split", panes: [a, b] };
      }
      // Collapse to a single pane, keeping whichever pane currently has focus.
      const keep =
        s.panes.find((p) => p.id === s.focusedPaneId) ??
        s.panes[0] ??
        makePane("A", null, "live");
      return {
        layout: "single",
        panes: [{ ...keep, id: "A" }],
        focusedPaneId: "A",
      };
    });
  },

  setFocusedPane(id) {
    set((s) => (s.panes.some((p) => p.id === id) ? { focusedPaneId: id } : s));
  },

  setPaneTab(id, tabId) {
    set((s) => ({
      panes: s.panes.map((p) =>
        p.id === id ? { ...p, tabId, cursor: { line: 1, col: 1 } } : p,
      ),
    }));
  },

  setPaneViewMode(id, m) {
    set((s) => ({
      panes: s.panes.map((p) => (p.id === id ? { ...p, viewMode: m } : p)),
    }));
  },

  setPaneCursor(id, c) {
    set((s) => ({
      panes: s.panes.map((p) =>
        p.id === id && (p.cursor.line !== c.line || p.cursor.col !== c.col)
          ? { ...p, cursor: c }
          : p,
      ),
    }));
  },

  setPaneScroll(id, top) {
    set((s) => ({
      panes: s.panes.map((p) => (p.id === id ? { ...p, scrollTop: top } : p)),
    }));
  },

  setSplitRatio(r) {
    set({ splitRatio: clampSplitRatio(r) });
  },

  hydrate(cfg, initialTabId) {
    const modes = cfg.paneViewModes ?? ["live", "preview"];
    const modeA: ViewMode = modes[0] ?? cfg.defaultView ?? "live";
    const modeB: ViewMode = modes[1] ?? "preview";
    const layout: WorkspaceLayout = cfg.workspaceLayout === "split" ? "split" : "single";
    const a = makePane("A", initialTabId, modeA);
    const panes = layout === "split" ? [a, makePane("B", initialTabId, modeB)] : [a];
    set({
      layout,
      panes,
      focusedPaneId: "A",
      splitRatio: clampSplitRatio(cfg.splitRatio ?? 0.5),
    });
  },
}));
