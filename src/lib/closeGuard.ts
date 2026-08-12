import { useTabsStore } from "../store/useTabsStore";
import { confirmUnsaved } from "../components/dialogs/UnsavedDialog";

/**
 * Request to close a tab. If the tab is dirty, confirm with the user first;
 * only then remove it from the store. Used by the tab close button and the
 * Ctrl+W hotkey so the dirty-check lives in one place.
 */
export async function requestCloseTab(id: string): Promise<void> {
  const tab = useTabsStore.getState().tabs.find((t) => t.id === id);
  if (!tab) return;
  if (tab.dirty) {
    const ok = await confirmUnsaved(tab.name);
    if (!ok) return;
  }
  useTabsStore.getState().closeTab(id);
}
