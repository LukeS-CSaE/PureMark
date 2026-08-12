/**
 * Theme hook (R-15 / R-16 / R-17).
 *
 * Resolves `config.theme` (`light` | `dark` | `auto`) into the effective theme,
 * writes it to `<html data-theme>` and mirrors it into `useUIStore` so that
 * non-CSS consumers (CodeMirror's `darkTheme` facet, canvas widgets, …) can
 * subscribe to it. When the preference is `auto` the OS colour-scheme is
 * watched live, so flipping the system theme updates the app without a restart.
 *
 * iter2-ext (§3.2): the accent colour is applied inside the SAME `commit(t)`
 * call as `applyTheme`. A separate effect subscribing to `resolvedTheme` would
 * see last render's value on the first frame and briefly paint `--primary-soft`
 * with the wrong alpha (0.10 <-> 0.18); committing both together is race-free.
 */
import { useEffect } from "react";
import { useConfigStore } from "../store/useConfigStore";
import { useUIStore } from "../store/useUIStore";
import { applyAccent, applyTheme, resolveTheme, watchSystemTheme } from "../lib/theme";
import type { ResolvedTheme } from "../types";

export function useTheme(): ResolvedTheme {
  const preference = useConfigStore((s) => s.config.theme);
  const accent = useConfigStore((s) => s.config.accent);
  const accentCustom = useConfigStore((s) => s.config.accentCustom);
  const resolvedTheme = useUIStore((s) => s.resolvedTheme);

  useEffect(() => {
    const commit = (t: ResolvedTheme) => {
      applyTheme(t); // still the ONLY writer of <html data-theme> (S-2)
      applyAccent(accent, accentCustom, t); // inline CSS variables only (S-1)
      useUIStore.getState().setResolvedTheme(t);
    };

    commit(resolveTheme(preference));

    if (preference !== "auto") return;
    // Only `auto` needs to track the OS.
    return watchSystemTheme((systemTheme) => commit(systemTheme));
  }, [preference, accent, accentCustom]);

  return resolvedTheme;
}
