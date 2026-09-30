/**
 * 方案 B —— 主动式实时文件监视（设计 §9 / T04）。
 *
 * 打开文件后用后台监视监听该 path；当磁盘被外部改动且 tab 为脏时，
 * 在界面顶部弹出非阻塞提示条（类 VS Code）：「文件已在外部被修改」
 * + [查看差异][忽略]。用户可随时解决，不必等到关闭。
 *
 * 实现选择（最小可行）：优先用 `@tauri-apps/plugin-fs` 的 `watch` 做即时通知，
 * 再以定时轮询做可靠性兜底（watch 在部分平台/场景可能漏报）。
 *
 * 误报处理（设计 §9 方案 B 缺点）：
 *  - 用 `diskSignature` 基线天然区分「自身保存」与「外部改动」；
 *  - 若磁盘内容等于内存 buffer（多为自身保存或 mtime 抖动），静默重置基线，
 *    绝不弹条。
 */
import { watch } from "@tauri-apps/plugin-fs";
import type { UnwatchFn } from "@tauri-apps/plugin-fs";
import { readFileMeta, readFileText } from "../commands/fsCommands";
import { useTabsStore } from "../store/useTabsStore";
import { useUIStore } from "../store/useUIStore";
import { fnv1a } from "./fileHash";

interface WatchEntry {
  path: string;
  unwatch: UnwatchFn | null;
  pollTimer: number | null;
  debounce: number | null;
}

const watchers = new Map<string, WatchEntry>();
const POLL_MS = 2000; // 轮询兜底间隔（watch 不可靠时的保证）
const DEBOUNCE_MS = 120; // 事件去抖

/** 去抖后真正执行一次磁盘检查。 */
function scheduleCheck(path: string): void {
  const entry = watchers.get(path);
  if (!entry) return;
  if (entry.debounce !== null) window.clearTimeout(entry.debounce);
  entry.debounce = window.setTimeout(() => {
    entry.debounce = null;
    void checkPath(path);
  }, DEBOUNCE_MS);
}

/** 核心判定：磁盘是否真的被外部改动，并据此提示或静默同步。 */
async function checkPath(path: string): Promise<void> {
  try {
    const tabs = useTabsStore.getState();
    const tab = tabs.tabs.find((t) => t.path === path);
    if (!tab) return;

    let meta;
    try {
      meta = await readFileMeta(path);
    } catch {
      return;
    }
    if (!meta.exists) return;

    const base = tab.diskSignature;
    // O(1) 快检：mtime+size 未变 → 磁盘无改动
    if (base && meta.mtimeMs === base.mtimeMs && meta.size === base.size) return;

    let diskContent: string;
    try {
      diskContent = await readFileText(path);
    } catch {
      return;
    }

    // 内容等于内存 buffer → 多为自身保存或 mtime 抖动 → 静默重置基线
    if (diskContent === tab.content) {
      tabs.setDiskSignature(tab.id, {
        mtimeMs: meta.mtimeMs,
        size: meta.size,
        hash: fnv1a(diskContent),
      });
      return;
    }

    // 内容确实与内存不同
    if (!tab.dirty) {
      // 未脏：外部改动后静默把 buffer 刷成磁盘内容，保持编辑器「所见即磁盘」
      await tabs.reloadFromDisk(path, diskContent);
      return;
    }

    // 脏 + 外部改动 → 弹出非阻塞提示条（方案 B）
    if (useUIStore.getState().conflictView?.tabId === tab.id) return; // 已开冲突页则不再重复弹条
    useUIStore.getState().showExternalChange({
      tabId: tab.id,
      name: tab.name,
      path,
      diskContent,
      diskMtimeMs: meta.mtimeMs,
    });
  } catch (err) {
    // 需求 C1：文件监视在 React 事件流之外（setTimeout/setInterval/watch 回调）
    // 改动 store，任何意外异常都只记录、绝不向外抛，避免「带外」状态突变把
    // 潜在崩溃放大成整窗白屏。
    console.error("[fileWatcher] checkPath 异常（已吞掉，不影响主界面）：", err);
  }
}

function startWatching(path: string): void {
  if (!path || watchers.has(path)) return;
  const entry: WatchEntry = { path, unwatch: null, pollTimer: null, debounce: null };
  watchers.set(path, entry);

  // ① 优先用 plugin-fs 的 watch（即时）
  void watch(path, () => scheduleCheck(path), { recursive: false })
    .then((unwatch) => {
      entry.unwatch = unwatch;
    })
    .catch(() => {
      entry.unwatch = null; // watch 不可用则仅靠轮询兜底
    });

  // ② 轮询兜底（可靠性保证）
  entry.pollTimer = window.setInterval(() => scheduleCheck(path), POLL_MS);
}

function stopWatching(path: string): void {
  const entry = watchers.get(path);
  if (!entry) return;
  if (entry.unwatch) {
    try {
      entry.unwatch();
    } catch {
      /* ignore */
    }
  }
  if (entry.pollTimer !== null) window.clearInterval(entry.pollTimer);
  if (entry.debounce !== null) window.clearTimeout(entry.debounce);
  watchers.delete(path);
}

/**
 * 订阅 tabs store，按「当前打开的带路径 tab」集合自动启停文件监视。
 * 在 App 启动时调用一次即可（设计 T04 / 方案 B）。
 */
export function initFileWatchers(): void {
  const reconcile = (): void => {
    const open = new Set(
      useTabsStore
        .getState()
        .tabs.filter((t) => t.path)
        .map((t) => t.path),
    );
    for (const p of open) if (!watchers.has(p)) startWatching(p);
    for (const p of [...watchers.keys()]) if (!open.has(p)) stopWatching(p);
  };
  reconcile();
  useTabsStore.subscribe(reconcile);
}

/** 测试 / 卸载用：停止全部监视。 */
export function stopAllWatching(): void {
  for (const p of [...watchers.keys()]) stopWatching(p);
}
