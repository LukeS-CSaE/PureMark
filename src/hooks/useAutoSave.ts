import { useEffect, useRef } from "react";
import { useConfigStore } from "../store/useConfigStore";
import { useTabsStore } from "../store/useTabsStore";
import { storeGet, storeSet } from "../lib/tauri";

/**
 * Debounced draft autosave. While editing a *saved* document (it has a real
 * path) and the tab is dirty, the current content is written to the `drafts`
 * key of the settings store. This is a loss-prevention net only — Ctrl+S is
 * what writes back to the original file (and clears the draft).
 */
export function useAutoSave(): void {
  const autoSave = useConfigStore((s) => s.config.autoSave);
  const delay = useConfigStore((s) => s.config.autoSaveDelay);
  const activeTab = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeId) ?? null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!autoSave || !activeTab || !activeTab.path || !activeTab.dirty) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        const drafts = (await storeGet<Record<string, string>>("drafts")) ?? {};
        drafts[activeTab.path] = activeTab.content;
        await storeSet("drafts", drafts);
      } catch {
        /* ignore draft persistence errors */
      }
    }, delay);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [autoSave, delay, activeTab?.path, activeTab?.content, activeTab?.dirty]);
}
