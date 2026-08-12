/**
 * Theme resolution layer (design §1.5 / R-15 / R-16 / R-17).
 *
 * Two distinct concepts:
 *   - `ThemePreference` — what the user picked (`light` | `dark` | `auto`), persisted.
 *   - `ResolvedTheme`   — what is actually rendered (`light` | `dark`).
 *
 * `<html data-theme>` may ONLY ever contain a `ResolvedTheme`; `applyTheme` is
 * the single place allowed to write it.
 */
import type { AccentId, ResolvedTheme, ThemePreference } from "../types";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Read the OS colour-scheme preference. Falls back to `light` when unavailable. */
export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  try {
    return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Map a user preference to the theme that should actually be rendered. */
export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === "light" || pref === "dark") return pref;
  return getSystemTheme();
}

/** The ONLY function allowed to mutate `document.documentElement.dataset.theme`. */
export function applyTheme(t: ResolvedTheme): void {
  if (typeof document === "undefined" || !document.documentElement) return;
  document.documentElement.dataset.theme = t;
}

/**
 * Subscribe to OS colour-scheme changes.
 * Returns an unsubscribe function (always safe to call, even when unsupported).
 */
export function watchSystemTheme(cb: (t: ResolvedTheme) => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {
      /* nothing to unsubscribe */
    };
  }
  let mq: MediaQueryList;
  try {
    mq = window.matchMedia(DARK_QUERY);
  } catch {
    return () => {
      /* nothing to unsubscribe */
    };
  }

  const handler = (e: MediaQueryListEvent) => cb(e.matches ? "dark" : "light");

  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }
  // Safari < 14 / older WebViews.
  const legacy = mq as MediaQueryList & {
    addListener?(l: (e: MediaQueryListEvent) => void): void;
    removeListener?(l: (e: MediaQueryListEvent) => void): void;
  };
  legacy.addListener?.(handler);
  return () => legacy.removeListener?.(handler);
}

/* ==================================================================== *
 * Accent colour layer — iter2-ext N-01 / N-02 (design §3.2)
 *
 * `deriveAccentVars` is a PURE function producing the five CSS custom
 * properties; `applyAccent` is the only place that touches the DOM and it
 * writes INLINE variables on `<html>` exclusively. It never writes
 * `data-theme` — `applyTheme` above keeps that privilege (shared knowledge
 * S-2), and it never writes neutral / layout tokens (S-1).
 * ==================================================================== */

/** One entry of the built-in palette. `custom` is intentionally excluded. */
export interface AccentPreset {
  id: Exclude<AccentId, "custom">;
  label: string;
  primary: string;
  hover: string;
}

/** The seven shipped accents (design §3.2). Shared by light and dark themes. */
export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: "azure", label: "蓝", primary: "#0071e3", hover: "#0066cc" },
  { id: "sky", label: "青", primary: "#0ea5e9", hover: "#0284c7" },
  { id: "blue", label: "靛", primary: "#3b82f6", hover: "#2563eb" },
  { id: "green", label: "绿", primary: "#10b981", hover: "#059669" },
  { id: "purple", label: "紫", primary: "#8b5cf6", hover: "#7c3aed" },
  { id: "orange", label: "橙", primary: "#f97316", hover: "#ea580c" },
  { id: "red", label: "红", primary: "#ef4444", hover: "#dc2626" },
  { id: "pink", label: "粉", primary: "#ec4899", hover: "#db2777" },
] as const;

/** Fallback used for every illegal input; equals the pre-iter2-ext colours. */
export const DEFAULT_ACCENT: AccentPreset = ACCENT_PRESETS[0];

const ACCENT_IDS: readonly AccentId[] = [
  ...ACCENT_PRESETS.map((p) => p.id),
  "custom",
];

/** Runtime guard for persisted / user-supplied accent ids. */
export function isAccentId(v: unknown): v is AccentId {
  return typeof v === "string" && (ACCENT_IDS as readonly string[]).includes(v);
}

/** Look a preset up by id. Returns `null` for `'custom'` and unknown ids. */
export function getAccentPreset(id: AccentId): AccentPreset | null {
  return ACCENT_PRESETS.find((p) => p.id === id) ?? null;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Parse `#rgb` / `#rrggbb` (with or without the leading `#`) into 0..255
 * channels. Returns `null` for anything else — callers fall back to `sky`.
 */
export function hexToRgb(hex: string): Rgb | null {
  if (typeof hex !== "string") return null;
  const m = HEX_RE.exec(hex.trim());
  if (!m) return null;
  let body = m[1];
  if (body.length === 3) {
    body = body[0] + body[0] + body[1] + body[1] + body[2] + body[2];
  }
  const n = Number.parseInt(body, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function channelToHex(c: number): string {
  const v = Math.max(0, Math.min(255, Math.round(c)));
  return v.toString(16).padStart(2, "0");
}

/** Serialise 0..255 channels back to a lowercase `#rrggbb` string. */
export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
}

function srgbToLinear(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * WCAG relative luminance in `[0, 1]`. Illegal hex degrades to the `sky`
 * luminance so downstream contrast decisions stay deterministic.
 */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex) ?? hexToRgb(DEFAULT_ACCENT.primary)!;
  return (
    0.2126 * srgbToLinear(rgb.r) +
    0.7152 * srgbToLinear(rgb.g) +
    0.0722 * srgbToLinear(rgb.b)
  );
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;

  if (d === 0) return { h: 0, s: 0, l };

  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

/**
 * Shift a colour's HSL lightness by `delta` (`[-1, 1]`), keeping hue and
 * saturation. Used to synthesise a hover colour for custom accents (P1);
 * built-in presets ship an explicit hover value instead.
 */
export function shiftLightness(hex: string, delta: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return DEFAULT_ACCENT.primary;
  const d = Number.isFinite(delta) ? Math.max(-1, Math.min(1, delta)) : 0;
  const hsl = rgbToHsl(rgb);
  hsl.l = Math.max(0, Math.min(1, hsl.l + d));
  return rgbToHex(hslToRgb(hsl));
}

/** Keys written by `deriveAccentVars` / `applyAccent`, and nothing else. */
export type AccentVarName =
  | "--primary"
  | "--primary-hover"
  | "--primary-soft"
  | "--ring"
  | "--primary-foreground";

/** Luminance above which a dark foreground reads better than white. */
const FOREGROUND_LUMINANCE_PIVOT = 0.6;
const SOFT_ALPHA_DARK = 0.18;
const SOFT_ALPHA_LIGHT = 0.1;
const RING_ALPHA = 0.35;
/** Same value as `--foreground` in the light theme. */
const DARK_FOREGROUND = "#1f2328";
const LIGHT_FOREGROUND = "#ffffff";

/**
 * Pure derivation of the five accent CSS variables (design §3.2).
 *
 * @param primary  Base accent hex. Illegal values fall back to `sky`.
 * @param hover    Explicit hover hex, or `null` to synthesise one.
 * @param resolved Effective theme — only affects `--primary-soft`'s alpha and
 *                 the direction of the synthesised hover shift.
 */
export function deriveAccentVars(
  primary: string,
  hover: string | null,
  resolved: ResolvedTheme,
): Record<AccentVarName, string> {
  const rgb = hexToRgb(primary);
  const basePrimary = rgb ? rgbToHex(rgb) : DEFAULT_ACCENT.primary;
  const baseRgb = rgb ?? hexToRgb(DEFAULT_ACCENT.primary)!;
  const isDark = resolved === "dark";

  const hoverRgb = hover ? hexToRgb(hover) : null;
  const resolvedHover = hoverRgb
    ? rgbToHex(hoverRgb)
    : shiftLightness(basePrimary, isDark ? 0.1 : -0.1);

  const { r, g, b } = baseRgb;
  return {
    "--primary": basePrimary,
    "--primary-hover": resolvedHover,
    "--primary-soft": `rgba(${r}, ${g}, ${b}, ${isDark ? SOFT_ALPHA_DARK : SOFT_ALPHA_LIGHT})`,
    "--ring": `rgba(${r}, ${g}, ${b}, ${RING_ALPHA})`,
    "--primary-foreground":
      relativeLuminance(basePrimary) > FOREGROUND_LUMINANCE_PIVOT
        ? DARK_FOREGROUND
        : LIGHT_FOREGROUND,
  };
}

/**
 * Write the derived accent variables as INLINE custom properties on `<html>`.
 *
 * Inline style beats both `:root` and `[data-theme="dark"]`, so this single
 * write point re-tints every Tailwind utility (`bg-primary`, `ring-ring`, …)
 * and every hand-written rule. Never throws: on any failure the UI simply
 * keeps the previous colours.
 */
export function applyAccent(
  accent: AccentId,
  custom: string | null,
  resolved: ResolvedTheme,
): void {
  try {
    if (typeof document === "undefined") return;
    const root = document.documentElement as HTMLElement | null;
    if (!root || !root.style || typeof root.style.setProperty !== "function") return;

    const preset = getAccentPreset(accent);
    const primary = preset ? preset.primary : custom ?? DEFAULT_ACCENT.primary;
    const hover = preset ? preset.hover : null;

    const vars = deriveAccentVars(primary, hover, resolved);
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
  } catch (err) {
    console.warn("[theme] applyAccent failed, keeping previous colours:", err);
  }
}
