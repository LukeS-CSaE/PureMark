/**
 * PureMark core type definitions. These mirror the Rust `FileNode` struct
 * (serialized with camelCase) and the in-memory editor/tab/pane models.
 *
 * iter2 concept layering (design §1.2):
 *   workspace level -> `WorkspaceLayout`  ('single' | 'split')   -> usePanesStore
 *   pane level      -> `Pane.viewMode`    ('edit'|'live'|'preview')
 *   document level  -> `EditorTab`        (single shared buffer)
 */

/** Pane-level render mode. `split` was removed in iter2 (it is a layout, not a mode). */
export type ViewMode = "edit" | "live" | "preview";

/** Workspace-level layout: one pane or two side-by-side panes. */
export type WorkspaceLayout = "single" | "split";

/** Fixed two-slot pane identity; array order equals visual left-to-right order. */
export type PaneId = "A" | "B";

/** User-selected theme preference (persisted in `AppConfig`). */
export type ThemePreference = "light" | "dark" | "auto";

/** Effective theme actually written to `<html data-theme>` — never `auto`. */
export type ResolvedTheme = "light" | "dark";

/**
 * Accent (brand primary) identifier — iter2-ext N-01 / N-02.
 * `custom` is reserved for the P1 colour picker (N-20); in P0 it is never
 * produced by the UI, but `migrateConfig` accepts it so a future downgrade
 * does not corrupt the value.
 */
export type AccentId =
  | "azure"
  | "sky"
  | "blue"
  | "green"
  | "purple"
  | "orange"
  | "red"
  | "pink"
  | "custom";

/** Table-of-contents panel position (iter2-ext N-07..N-16). */
export type TocPosition = "left" | "right";

/** Sidebar shape. Session-only state — deliberately NOT persisted. */
export type SidebarMode = "files" | "toc";

/** One heading entry of the document outline. */
export interface TocItem {
  /** React key / future anchor; slugified `text` with de-duplication. */
  id: string;
  /** Heading depth, 1..6. */
  level: number;
  /** Plain text with inline Markdown markers stripped. */
  text: string;
  /** 1-based line number, used to position the CodeMirror caret. */
  line: number;
  /** 0-based index of this heading in the document, used for preview DOM lookup. */
  index: number;
}

/**
 * Window geometry as persisted under the `window-state` store key (iter2-ext
 * N-03 / N-04 / N-05). Both `schema` and `unit` are mandatory discriminators:
 * a record missing either one is pre-iter2-ext dirty data (unknown unit) and
 * MUST be discarded wholesale rather than reinterpreted.
 */
export interface WindowGeometry {
  /** Structure version; a missing value marks the record as dirty legacy data. */
  schema: 2;
  /** Unit marker; must be `'logical'`, anything else is dirty legacy data. */
  unit: "logical";
  width: number;
  height: number;
  maximized: boolean;
}

export interface FileNode {
  /** Unique id — the absolute path. */
  id: string;
  /** File or directory name. */
  name: string;
  /** Absolute path (Tauri). */
  path: string;
  isDir: boolean;
  /** Present only for directories. */
  children?: FileNode[];
  /** Tree depth, used for indentation. */
  depth: number;
}

export interface Cursor {
  /** 1-based line. */
  line: number;
  /** 1-based column. */
  col: number;
}

/**
 * A single editor pane. Two panes may reference the *same* `tabId` (same-file
 * split): the buffer is shared but cursor and scroll position are per pane.
 */
export interface Pane {
  id: PaneId;
  /** Referenced `EditorTab.id`, or `null` when the pane shows nothing. */
  tabId: string | null;
  /** Render mode of this pane (R-12: independent per pane). */
  viewMode: ViewMode;
  /** 1-based caret position inside this pane (R-10). */
  cursor: Cursor;
  /** Snapshotted scroll offset, restored when the pane switches back to a tab. */
  scrollTop: number;
}

export interface EditorTab {
  /** Local uuid for the tab. */
  id: string;
  /** Absolute path; empty string for an unsaved (untitled) document. */
  path: string;
  /** File name shown on the tab. */
  name: string;
  /** Current in-memory content. */
  content: string;
  /** Last persisted content — the dirty-comparison baseline. */
  savedContent: string;
  /** content !== savedContent. */
  dirty: boolean;
  /**
   * @deprecated iter2: the caret belongs to a `Pane` (same-file split needs two
   * independent carets). Kept only for backwards compatibility — never write to
   * it from new code, read `usePanesStore` instead.
   */
  cursor: Cursor;
}

/**
 * @deprecated iter2-ext (N-05): the single source of truth for window geometry
 * is the `window-state` store key (`WindowGeometry`). This shape is kept only
 * so old `settings.json` files are not destroyed on migration.
 */
export interface WindowSize {
  width: number;
  height: number;
  maximized: boolean;
}

export interface AppConfig {
  /** Schema version used by `migrateConfig`; iter2 = 2, iter2-ext = 3. */
  configVersion: number;
  theme: ThemePreference;
  fontFamily: string;
  fontSize: number;
  /** Default render mode for a freshly created pane. */
  defaultView: ViewMode;
  /** Persisted workspace layout (R-25). */
  workspaceLayout: WorkspaceLayout;
  /** Persisted left-pane width ratio, clamped to [0.2, 0.8] (R-25). */
  splitRatio: number;
  /** Persisted per-pane render modes, `[paneA, paneB]` (R-25). */
  paneViewModes: [ViewMode, ViewMode];
  sidebarVisible: boolean;
  sidebarWidth: number;
  lastFolder: string | null;
  recentFiles: string[];

  /* ---- iter2-ext additions (configVersion 3) ---------------------------- */

  /** Accent preset id; defaults to `'sky'` so existing users see no change. */
  accent: AccentId;
  /** Custom primary hex for `accent === 'custom'` (P1 / N-20); P0 keeps it null. */
  accentCustom: string | null;
  /** Outline panel visibility; defaults to `false`. */
  tocVisible: boolean;
  /** Outline panel position; defaults to `'right'`. */
  tocPosition: TocPosition;
  /** Right-hand outline panel width in px; defaults to 220. */
  tocWidth: number;

  /**
   * @deprecated iter2-ext (N-05): window geometry now lives in the
   * `window-state` store key. No business code reads or writes this field; it
   * only survives migration so old settings files are not truncated. Do NOT
   * add new reads/writes — the whole field can be dropped next iteration.
   */
  window: WindowSize;

  /** Auto-save a draft to the store on edit (loss prevention). */
  autoSave: boolean;
  /** Debounce delay in ms for the draft autosave. */
  autoSaveDelay: number;

  /**
   * Phase 1 migration flag: render the `live` view with ProseMirror/TipTap
   * instead of CodeMirror 6. Off by default — CM6 stays the active engine and
   * is fully reversible until Phase 3 removes it. See docs/项目认知与现状总览.md §6.
   */
  useProseMirrorLive: boolean;
}

export type FormatCommand =
  | "h1"
  | "h2"
  | "h3"
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "ul"
  | "ol"
  | "task"
  | "quote"
  | "link"
  | "image"
  | "table";

export interface EditorStats {
  line: number;
  col: number;
  lines: number;
  words: number;
  chars: number;
}

/** Drafts map: absolute path -> in-memory draft content. */
export type DraftsMap = Record<string, string>;
