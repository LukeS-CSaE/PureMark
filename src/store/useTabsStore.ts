/**
 * Multi-tab editor store. Owns the open documents, the active tab, content
 * edits, cursor position and persistence. Saving uses the fs bridge; for
 * untitled documents it falls back to a save-as dialog.
 *
 * 需求1 扩展：新增 `reloadFromDisk` / `reloadActiveFromDisk` / `setDiskSignature`，
 * 并在 `openTab` / `saveTab` 写入 `diskSignature` 基线（设计 §2 / §7）。
 */
import { create } from "zustand";
import type { Cursor, EditorTab, DiskSignature } from "../types";
import {
  writeFileTextWithEncoding,
  saveFileDialog,
  readFileTextWithEncoding,
} from "../commands/fsCommands";
import { storeGet, storeSet } from "../lib/tauri";
import { captureDiskState } from "../lib/conflictGuard";
import { requestCloseTab } from "../lib/closeGuard";
import { useUIStore } from "./useUIStore";
import { useConfigStore } from "./useConfigStore";

interface OpenTabInput {
  path: string;
  name: string;
  content: string;
  /** 文件原始编码（非 UTF-8 文档由 readFileTextWithEncoding 检测得出）。 */
  encoding?: string;
  /** 原文件是否带 BOM。 */
  hadBom?: boolean;
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
  /** 从磁盘重载某 path 的 buffer（保留 React 外壳，不整窗 reload）。 */
  reloadFromDisk(path: string, diskContent?: string): Promise<void>;
  /** 从磁盘重载当前活动文档。 */
  reloadActiveFromDisk(): Promise<void>;
  /** 写入 / 清除某 tab 的磁盘基线签名。 */
  setDiskSignature(id: string, sig: DiskSignature | null): void;
  /** 关闭除 `id` 外的所有标签（逐项走脏写守卫）。 */
  closeOthers(id: string): Promise<void>;
  /** 关闭 `id` 右侧的所有标签。 */
  closeRight(id: string): Promise<void>;
  /** 关闭 `id` 左侧的所有标签。 */
  closeLeft(id: string): Promise<void>;
  /** 关闭全部标签。 */
  closeAll(): Promise<void>;
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const untitledCounter = { n: 0 };

/** 清除某 path 的自动保存草稿（与保存/刷新语义一致，设计 §7.1）。 */
async function clearDraft(path: string): Promise<void> {
  try {
    const drafts = (await storeGet<Record<string, string>>("drafts")) ?? {};
    if (path in drafts) {
      delete drafts[path];
      await storeSet("drafts", drafts);
    }
  } catch {
    /* ignore draft cleanup errors */
  }
}

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
      encoding: file.encoding ?? "utf-8",
      hadBom: file.hadBom ?? false,
      diskSignature: null,
      cursor: { line: 1, col: 1 },
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }));

    // 打开成功后异步拍摄磁盘基线（设计 §7.2）；失败静默忽略
    if (file.path) {
      void captureDiskState(file.path, file.content)
        .then((sig) => {
          if (sig) get().setDiskSignature(tab.id, sig);
        })
        .catch(() => {
          /* ignore — 下次保存/检测会重试 */
        });
    }
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
      diskSignature: null,
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
      // 保存对话框默认打开与侧栏文件目录相同的文件夹（其次 lastFolder）。
      const dir =
        useUIStore.getState().currentFolder ??
        useConfigStore.getState().config.lastFolder ??
        undefined;
      const chosen = await saveFileDialog(tab.name, dir);
      if (!chosen) return; // user cancelled — keep the tab dirty
      path = chosen;
    }

    // 按文件原编码写回（GBK/Big5 等中文编码不会被改写成 UTF-8）。
    await writeFileTextWithEncoding(path, tab.content, tab.encoding ?? "utf-8", tab.hadBom ?? false);

    // 拍摄新基线（用刚写入的内存内容算 hash，避免重复读盘）
    const sig = await captureDiskState(path, tab.content);

    // 落盘后清除草稿
    await clearDraft(path);

    const fileName = path.split(/[\\/]/).pop() ?? tab.name;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              path,
              name: fileName,
              savedContent: tab.content,
              dirty: false,
              diskSignature: sig,
            }
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

  async reloadFromDisk(path, diskContent?) {
    // 外部传入内容（如 fileWatcher 已读取）时沿用 tab 现有编码；
    // 否则重新检测磁盘编码（外部编辑器可能改过编码）。
    let content = diskContent;
    let encoding: string | undefined;
    let hadBom: boolean | undefined;
    if (content === undefined) {
      const read = await readFileTextWithEncoding(path);
      content = read.content;
      encoding = read.encoding;
      hadBom = read.hadBom;
    }
    const sig = await captureDiskState(path, content);
    // 显式「接受磁盘版本」：清除该 path 草稿（设计 §7.1）
    await clearDraft(path);
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.path === path
          ? {
              ...t,
              content,
              savedContent: content,
              dirty: false,
              diskSignature: sig,
              ...(encoding !== undefined ? { encoding, hadBom } : {}),
            }
          : t,
      ),
    }));
  },

  async reloadActiveFromDisk() {
    const a = get().getActive();
    if (a && a.path) await get().reloadFromDisk(a.path);
  },

  setDiskSignature(id, sig) {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, diskSignature: sig } : t)),
    }));
  },

  async closeOthers(id) {
    const targets = get().tabs.filter((t) => t.id !== id).map((t) => t.id);
    for (const tid of targets) {
      if (get().tabs.some((t) => t.id === tid)) await requestCloseTab(tid);
    }
    if (get().tabs.some((t) => t.id === id)) set({ activeId: id });
  },

  async closeRight(id) {
    const idx = get().tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const targets = get().tabs.slice(idx + 1).map((t) => t.id);
    for (const tid of targets) {
      if (get().tabs.some((t) => t.id === tid)) await requestCloseTab(tid);
    }
    if (get().tabs.some((t) => t.id === id)) set({ activeId: id });
  },

  async closeLeft(id) {
    const idx = get().tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const targets = get().tabs.slice(0, idx).map((t) => t.id);
    for (const tid of targets) {
      if (get().tabs.some((t) => t.id === tid)) await requestCloseTab(tid);
    }
    if (get().tabs.some((t) => t.id === id)) set({ activeId: id });
  },

  async closeAll() {
    const targets = get().tabs.map((t) => t.id);
    for (const tid of targets) {
      if (get().tabs.some((t) => t.id === tid)) await requestCloseTab(tid);
    }
  },
}));
