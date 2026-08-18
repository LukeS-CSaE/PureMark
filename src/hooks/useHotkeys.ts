/**
 * Global keyboard shortcut registry (iter2-ext T05 / N-17).
 *
 * Bindings are supplied as a `HotkeyMap` — keys are strings like `"Ctrl+F"`,
 * values are callbacks. The matcher is case-insensitive on the key letter and
 * accepts either `Ctrl` or `Cmd` as the modifier, so a single `"Ctrl+F"`
 * entry matches both Ctrl+F (Win/Linux) and Cmd+F (mac). Callers that want
 * platform-specific behaviour can register both keys separately.
 *
 * The hook re-attaches its listener whenever the `map` reference changes, so
 * freshly created maps at the call site pick up the latest callbacks without
 * needing the consumer to memoise.
 */
import { useEffect } from "react";

export type HotkeyMap = Record<string, () => void>;

/**
 * Pure matcher: returns the callback bound to `e`'s key + modifier, or `null`.
 * Exposed so tests can verify routing without rendering a React tree.
 */
export function matchHotkey(
  map: HotkeyMap,
  e: { key: string; ctrlKey: boolean; metaKey: boolean },
): (() => void) | null {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  for (const combo of Object.keys(map)) {
    const parts = combo.toLowerCase().split("+");
    const wantKey = parts[parts.length - 1];
    const wantsMod = parts.includes("ctrl") || parts.includes("cmd");
    if (wantKey !== key) continue;
    if (wantsMod) {
      // 需要修饰键的组合（如 Ctrl+F / Ctrl+R）：必须按下修饰键
      if (!mod) continue;
    } else {
      // 无修饰键组合（如 F5）：无论是否按下修饰键都匹配，
      // 以确保 Ctrl+F5 等也被拦截（设计 D2：F5/Ctrl+R 不放行）。
    }
    return map[combo];
  }
  return null;
}

/**
 * Build a keydown handler that routes through `matchHotkey`. Always calls
 * `preventDefault()` on a match so the browser's native Find toolbar (Ctrl+F)
 * or window-close prompt (Ctrl+W) never fires.
 */
export function createHotkeyHandler(map: HotkeyMap) {
  return function handler(e: KeyboardEvent): void {
    const cb = matchHotkey(map, e);
    if (cb) {
      e.preventDefault();
      cb();
    }
  };
}

/**
 * Install a global keydown listener that routes events through the supplied
 * hotkey map. See `matchHotkey` for the matching rules.
 */
export function useHotkeys(map: HotkeyMap): void {
  useEffect(() => {
    const handler = createHotkeyHandler(map);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [map]);
}