/**
 * Multi-tab editor store. Owns the open documents, the active tab, content
 * edits, cursor position and persistence. Saving uses the fs bridge; for
 * untitled documents it falls back to a save-as dialog.
 */
import { create } from "zustand";
import type { Cursor, EditorTab } from "../types";
import { writeFileText, saveFileDialog } from "../commands/fsCommands";
import { storeGet, storeSet } from "../lib/tauri";

interface OpenTabInput {
  path: string;
  name: string;
  content: string;
}

interface TabsState {
  tabs: EditorTab[];
  activeId: string | null;
  /** Open a file (activates an existing tab for the same path). */
  openTab(file: OpenTabInput): void;
  /** Create a new empty, untitled document. */
  newUntitled(): void;
  /** Close a tab by id (caller handles the dirty confirmation). */
  closeTab(id: string): void;
  /** Activate a tab. */
  setActive(id: string): void;
  /** Replace a tab's content and recompute its dirty flag. */
  updateContent(id: string, value: string): void;
  /** Update a tab's cursor (1-based line/col). */
  setCursor(id: string, c: Cursor): void;
  /** Persist a specific tab back to disk. */
  saveTab(id: string): Promise<void>;
  /** Persist the active tab. */
  saveActive(): Promise<void>;
  /** Whether any open tab is dirty. */
  isAnyDirty(): boolean;
  /** Convenience getter for the active tab. */
  getActive(): EditorTab | null;
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const untitledCounter = { n: 0 };

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeId: null,

  openTab(file) {
    if (file.path !== "") {
      const existing = get().tabs.find((t) => t.path === file.path);
      if (existing) {
        set({ activeId: existing.id });
        return;
      }
    }
    const tab: EditorTab = {
      id: uid(),
      path: file.path,
      name: file.name,
      content: file.content,
      savedContent: file.content,
      dirty: false,
      cursor: { line: 1, col: 1 },
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }));
  },

  newUntitled() {
    untitledCounter.n += 1;
    const name = `未命名-${untitledCounter.n}.md`;
    const tab: EditorTab = {
      id: uid(),
      path: "",
      name,
      content: "",
      savedContent: "",
      dirty: false,
      cursor: { line: 1, col: 1 },
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }));
  },

  closeTab(id) {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      if (idx === -1) return s;
      const tabs = s.tabs.filter((t) => t.id !== id);
      let activeId = s.activeId;
      if (activeId === id) {
        const neighbor = tabs[idx] ?? tabs[idx - 1] ?? null;
        activeId = neighbor ? neighbor.id : null;
      }
      return { tabs, activeId };
    });
  },

  setActive(id) {
    set({ activeId: id });
  },

  updateContent(id, value) {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id
          ? { ...t, content: value, dirty: value !== t.savedContent }
          : t,
      ),
    }));
  },

  setCursor(id, c) {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, cursor: c } : t)),
    }));
  },

  async saveTab(id) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;

    let path = tab.path;
    if (!path) {
      const chosen = await saveFileDialog(tab.name);
      if (!chosen) return; // user cancelled — keep the tab dirty
      path = chosen;
    }

    await writeFileText(path, tab.content);

    // Drop the now-persisted draft.
    try {
      const drafts = (await storeGet<Record<string, string>>("drafts")) ?? {};
      if (path in drafts) {
        delete drafts[path];
        await storeSet("drafts", drafts);
      }
    } catch {
      /* ignore draft cleanup errors */
    }

    const fileName = path.split(/[\\/]/).pop() ?? tab.name;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id
          ? { ...t, path, name: fileName, savedContent: tab.content, dirty: false }
          : t,
      ),
    }));
  },

  async saveActive() {
    const id = get().activeId;
    if (id) await get().saveTab(id);
  },

  isAnyDirty() {
    return get().tabs.some((t) => t.dirty);
  },

  getActive() {
    const { tabs, activeId } = get();
    return tabs.find((t) => t.id === activeId) ?? null;
  },
}));
