/**
 * UI / session store. Holds sidebar visibility, the current folder and its
 * Markdown tree, the search / settings panels' open state, and the *resolved*
 * theme (`light` | `dark`) that the rest of the UI subscribes to.
 *
 * iter2: `viewMode` was removed — the render mode now lives on each `Pane`
 * (see `usePanesStore`), otherwise there would be two sources of truth.
 */
import { create } from "zustand";
import type {
  FileNode,
  ResolvedTheme,
  SidebarMode,
  UnsavedDialogState,
  ConflictViewModel,
  ExternalChangeNotice,
  ContextMenuState,
} from "../types";

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

  /** 自定义确认弹窗状态（未保存/刷新/冲突），驱动 UnsavedDialog（需求1）。 */
  unsaved: UnsavedDialogState | null;
  /** 冲突解决页视图模型；非空时渲染左右分屏（需求1）。 */
  conflictView: ConflictViewModel | null;
  /** 方案 B：外部改动非阻塞提示条通知；非空时渲染顶部提示条。 */
  externalChange: ExternalChangeNotice | null;

  /** 自定义右键菜单状态（需求2）：非空时渲染 <ContextMenu/>。 */
  contextMenu: ContextMenuState | null;
  /** 打开自定义菜单（编辑器 / 文件树 / 标签页）。 */
  openContextMenu(state: ContextMenuState): void;
  /** 关闭自定义菜单。 */
  closeContextMenu(): void;

  setResolvedTheme(t: ResolvedTheme): void;
  toggleSidebar(): void;
  setSidebarVisible(v: boolean): void;
  setSidebarWidth(w: number): void;
  setSidebarMode(m: SidebarMode): void;
  setFolder(path: string, tree: FileNode[]): void;
  setSearchOpen(b: boolean): void;
  setConfigOpen(b: boolean): void;

  openUnsaved(state: UnsavedDialogState): void;
  closeUnsaved(): void;
  openConflictView(model: ConflictViewModel): void;
  closeConflictView(): void;
  showExternalChange(notice: ExternalChangeNotice): void;
  dismissExternalChange(): void;
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

  unsaved: null,
  conflictView: null,
  externalChange: null,
  contextMenu: null,

  setResolvedTheme: (t) => set((s) => (s.resolvedTheme === t ? s : { resolvedTheme: t })),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  setSidebarVisible: (v) => set({ sidebarVisible: v }),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  setSidebarMode: (m) => set((s) => (s.sidebarMode === m ? s : { sidebarMode: m })),
  setFolder: (path, tree) => set({ currentFolder: path, tree }),
  setSearchOpen: (b) => set({ searchOpen: b }),
  setConfigOpen: (b) => set({ configOpen: b }),

  openUnsaved: (state) => set({ unsaved: state }),
  closeUnsaved: () => set({ unsaved: null }),
  openConflictView: (model) => set({ conflictView: model }),
  closeConflictView: () => set({ conflictView: null }),
  showExternalChange: (notice) => set({ externalChange: notice }),
  dismissExternalChange: () => set({ externalChange: null }),

  openContextMenu: (state) => set({ contextMenu: state }),
  closeContextMenu: () => set({ contextMenu: null }),
}));
