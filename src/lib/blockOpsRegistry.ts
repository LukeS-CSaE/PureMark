/**
 * 块操作注册表 —— 与 `tocRegistry` / `editorRegistry` 正交（同为 paneId 键控、
 * 各自独立 Map）。
 *
 * 块操作（Ctrl+D 复制块 / Alt+↑·↓ 移动块）挂在 App 的窗口级
 * 全局热键上（而非编辑器内 keymap）：编辑器级绑定只有焦点恰好在可编辑区内
 * 才生效，且部分组合会被 WebView2 / 系统层吞掉或冲突；提升到窗口级
 * 后只要 focus 在 PureMark 窗口内即触发。各视图挂载时注册自己的实现：
 *   • MarkdownView（live / edit TipTap）→ 顶层文档块语义；
 *   • CodeEditor（CM 源码视图）→ 空行分隔的段落块语义。
 * preview（只读）不注册，全局处理器静默吞键。
 *
 * 纯模块：无 React、无 store、无 Tauri，node 环境可测。
 */
import type { PaneId } from "../types";

/** 一个 pane 暴露给全局块快捷键的操作。返回 false 表示未生效（边界/只读）。 */
export interface BlockOpsHandle {
  /** 复制当前块到正下方。 */
  duplicate: () => boolean;
  /** 当前块与相邻块交换位置；dir=-1 上移、1 下移。 */
  move: (dir: -1 | 1) => boolean;
}

const handles = new Map<PaneId, BlockOpsHandle>();

/** 注册（或替换）一个 pane 的块操作句柄。 */
export function registerBlockOps(paneId: PaneId, handle: BlockOpsHandle): void {
  handles.set(paneId, handle);
}

/** 注销；对未注册的 pane 调用安全。 */
export function unregisterBlockOps(paneId: PaneId): void {
  handles.delete(paneId);
}

/** 查询 pane 的块操作句柄；未注册返回 undefined。 */
export function getBlockOps(paneId: PaneId): BlockOpsHandle | undefined {
  return handles.get(paneId);
}

/** 测试/调试用：清空全部注册。 */
export function clearBlockOps(): void {
  handles.clear();
}
