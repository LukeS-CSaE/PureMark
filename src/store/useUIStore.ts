/**
 * UI / session store. Holds sidebar visibility, the current folder and its
 * Markdown tree, the search / settings panels' open state, and the *resolved*
 * theme (`light` | `dark`) that the rest of the UI subscribes to.
 *
 * iter2: `viewMode` was removed — the render mode now lives on each `Pane`
 * (see `usePanesStore`), otherwise there would be two sources of truth.
 */
import { create } from "zustand";
import type { FileNode, ResolvedTheme, SidebarMode } from "../types";

interface UIState {
  /** Effective theme; written only by `hooks/useTheme.ts`. */
  resolvedTheme: ResolvedTheme;
  sidebarVisible: boolean;
  sidebarWidth: number;
  /**
   * Which face the sidebar shows (iter2-ext). Session-only: it is derived from
   * `config.tocVisible` / `config.tocPosition` at startup and must only ever be
   * mutated through `lib/tocRouter.ts` (shared knowledge S-3).
   */
  sidebarMode: SidebarMode;
  currentFolder: string | null;
  tree: FileNode[];
  searchOpen: boolean;
  configOpen: boolean;
  setResolvedTheme(t: ResolvedTheme): void;
  toggleSidebar(): void;
  setSidebarVisible(v: boolean): void;
  setSidebarWidth(w: number): void;
  setSidebarMode(m: SidebarMode): void;
  setFolder(path: string, tree: FileNode[]): void;
  setSearchOpen(b: boolean): void;
  setConfigOpen(b: boolean): void;
}

export const useUIStore = create<UIState>((set) => ({
  resolvedTheme: "light",
  sidebarVisible: true,
  sidebarWidth: 248,
  sidebarMode: "files",
  currentFolder: null,
  tree: [],
  searchOpen: false,
  configOpen: false,

  setResolvedTheme: (t) => set((s) => (s.resolvedTheme === t ? s : { resolvedTheme: t })),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  setSidebarVisible: (v) => set({ sidebarVisible: v }),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  setSidebarMode: (m) => set((s) => (s.sidebarMode === m ? s : { sidebarMode: m })),
  setFolder: (path, tree) => set({ currentFolder: path, tree }),
  setSearchOpen: (b) => set({ searchOpen: b }),
  setConfigOpen: (b) => set({ configOpen: b }),
}));
