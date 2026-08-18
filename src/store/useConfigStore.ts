/**
 * Persistent configuration store. Loads/saves the `AppConfig` object to the
 * `settings.json` store under the `config` key. All mutations persist
 * asynchronously via `update`.
 *
 * iter2 adds `migrateConfig` (R-20): any pre-iter2 settings file is upgraded to
 * the new schema; malformed values fall back to defaults and NEVER throw.
 *
 * iter2-ext bumps the schema to 3 (S-14): `accent` / `accentCustom` /
 * `tocVisible` / `tocPosition` / `tocWidth` are backfilled with defaults that
 * reproduce the pre-iter2-ext look exactly, so upgrading users notice nothing.
 */
import { create } from "zustand";
import type {
  AccentId,
  AppConfig,
  ThemePreference,
  TocPosition,
  ViewMode,
  WindowSize,
  WorkspaceLayout,
} from "../types";
import { isAccentId } from "../lib/theme";
import { storeGet, storeSet } from "../lib/tauri";

export const CONFIG_VERSION = 3;

/** Bounds for the outline panel width; mirrors `clamp()` in layout.css (S-12). */
export const TOC_WIDTH_MIN = 180;
export const TOC_WIDTH_MAX = 480;

export const DEFAULT_CONFIG: AppConfig = {
  configVersion: CONFIG_VERSION,
  theme: "auto",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif',
  fontSize: 14,
  defaultView: "live",
  workspaceLayout: "single",
  splitRatio: 0.5,
  paneViewModes: ["live", "preview"],
  sidebarVisible: true,
  sidebarWidth: 248,
  lastFolder: null,
  recentFiles: [],
  accent: "sky",
  accentCustom: null,
  tocVisible: false,
  tocPosition: "right",
  tocWidth: 220,
  window: { width: 1200, height: 800, maximized: false },
  autoSave: true,
  autoSaveDelay: 800,
  useProseMirrorLive: true,
  useCodeMirrorSource: false,
  showScrollbar: true,
};

/* ------------------------------------------------------------------ *
 * migrateConfig — R-20
 * ------------------------------------------------------------------ */

const THEME_VALUES: ThemePreference[] = ["light", "dark", "auto"];
const VIEW_VALUES: ViewMode[] = ["edit", "live", "preview"];

function isThemePreference(v: unknown): v is ThemePreference {
  return typeof v === "string" && (THEME_VALUES as string[]).includes(v);
}

function isViewMode(v: unknown): v is ViewMode {
  return typeof v === "string" && (VIEW_VALUES as string[]).includes(v);
}

/** Legacy `'split'` view mode maps to `'live'` (PM decision, design §3.2). */
function normalizeViewMode(v: unknown, fallback: ViewMode): ViewMode {
  if (v === "split") return "live";
  return isViewMode(v) ? v : fallback;
}

function clampRatio(v: unknown, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(0.8, Math.max(0.2, n));
}

function readString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

function readNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function readBoolean(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function readWindow(v: unknown): WindowSize {
  if (v && typeof v === "object") {
    const w = v as Record<string, unknown>;
    return {
      width: readNumber(w.width, DEFAULT_CONFIG.window.width),
      height: readNumber(w.height, DEFAULT_CONFIG.window.height),
      maximized: readBoolean(w.maximized, DEFAULT_CONFIG.window.maximized),
    };
  }
  return { ...DEFAULT_CONFIG.window };
}

/* ---- iter2-ext (configVersion 3) readers ---------------------------- */

/** Unknown / missing accent ids degrade to `sky` — the historical colour. */
function readAccent(v: unknown): AccentId {
  return isAccentId(v) ? v : DEFAULT_CONFIG.accent;
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Only a syntactically valid hex survives; everything else becomes `null`. */
function readAccentCustom(v: unknown): string | null {
  return typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim().toLowerCase() : null;
}

function readTocPosition(v: unknown): TocPosition {
  return v === "left" || v === "right" ? v : DEFAULT_CONFIG.tocPosition;
}

function readTocWidth(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : DEFAULT_CONFIG.tocWidth;
  return Math.min(TOC_WIDTH_MAX, Math.max(TOC_WIDTH_MIN, Math.round(n)));
}

function readPaneViewModes(v: unknown, defaultView: ViewMode): [ViewMode, ViewMode] {
  if (Array.isArray(v) && v.length >= 2) {
    return [
      normalizeViewMode(v[0], defaultView),
      normalizeViewMode(v[1], DEFAULT_CONFIG.paneViewModes[1]),
    ];
  }
  // Missing -> keep the user's default view for pane A so their preference is
  // not silently dropped; pane B falls back to the shipped default.
  return [defaultView, DEFAULT_CONFIG.paneViewModes[1]];
}

/**
 * Upgrade a raw persisted settings blob to the iter2 `AppConfig` shape.
 * Never throws: any unexpected input degrades to `DEFAULT_CONFIG`.
 */
export function migrateConfig(raw: unknown): AppConfig {
  try {
    if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
      return { ...DEFAULT_CONFIG, window: { ...DEFAULT_CONFIG.window }, recentFiles: [] };
    }
    const r = raw as Record<string, unknown>;

    const theme: ThemePreference = isThemePreference(r.theme) ? r.theme : "auto";
    const defaultView = normalizeViewMode(r.defaultView, "live");
    const workspaceLayout: WorkspaceLayout = r.workspaceLayout === "split" ? "split" : "single";
    const splitRatio = clampRatio(r.splitRatio, DEFAULT_CONFIG.splitRatio);
    const paneViewModes = readPaneViewModes(r.paneViewModes, defaultView);

    return {
      configVersion: CONFIG_VERSION,
      theme,
      fontFamily: readString(r.fontFamily, DEFAULT_CONFIG.fontFamily),
      fontSize: readNumber(r.fontSize, DEFAULT_CONFIG.fontSize),
      defaultView,
      workspaceLayout,
      splitRatio,
      paneViewModes,
      sidebarVisible: readBoolean(r.sidebarVisible, DEFAULT_CONFIG.sidebarVisible),
      sidebarWidth: readNumber(r.sidebarWidth, DEFAULT_CONFIG.sidebarWidth),
      lastFolder: typeof r.lastFolder === "string" ? r.lastFolder : null,
      recentFiles: Array.isArray(r.recentFiles)
        ? r.recentFiles.filter((p): p is string => typeof p === "string")
        : [],
      accent: readAccent(r.accent),
      accentCustom: readAccentCustom(r.accentCustom),
      tocVisible: readBoolean(r.tocVisible, DEFAULT_CONFIG.tocVisible),
      tocPosition: readTocPosition(r.tocPosition),
      tocWidth: readTocWidth(r.tocWidth),
      window: readWindow(r.window),
      autoSave: readBoolean(r.autoSave, DEFAULT_CONFIG.autoSave),
      autoSaveDelay: readNumber(r.autoSaveDelay, DEFAULT_CONFIG.autoSaveDelay),
      useProseMirrorLive: readBoolean(r.useProseMirrorLive, DEFAULT_CONFIG.useProseMirrorLive),
      useCodeMirrorSource: readBoolean(r.useCodeMirrorSource, DEFAULT_CONFIG.useCodeMirrorSource),
      showScrollbar: readBoolean(r.showScrollbar, DEFAULT_CONFIG.showScrollbar),
    };
  } catch (err) {
    console.warn("[config] migration failed, falling back to defaults:", err);
    return { ...DEFAULT_CONFIG, window: { ...DEFAULT_CONFIG.window }, recentFiles: [] };
  }
}

/* ------------------------------------------------------------------ */

interface ConfigState {
  config: AppConfig;
  loaded: boolean;
  load(): Promise<void>;
  save(): Promise<void>;
  update(patch: Partial<AppConfig>): void;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: DEFAULT_CONFIG,
  loaded: false,

  async load() {
    try {
      const stored = await storeGet<unknown>("config");
      set({ config: migrateConfig(stored), loaded: true });
    } catch (err) {
      console.warn("[config] load failed, using defaults:", err);
      set({ config: migrateConfig(null), loaded: true });
    }
  },

  async save() {
    await storeSet("config", get().config);
  },

  update(patch) {
    set((s) => ({ config: { ...s.config, ...patch } }));
    void get().save();
  },
}));
