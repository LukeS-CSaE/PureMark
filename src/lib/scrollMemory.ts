/**
 * 每文档滚动进度记忆（纯逻辑，node 可测）。
 *
 * 背景：CodeEditor（CM 源码视图）自带文档切换时的滚动快照/恢复（设计 §8.2），
 * 而 MarkdownView（live / preview）没有等价机制——切换 tab 后 TipTap 编辑器重建、
 * 内容整体替换，滚动容器的 scrollTop 被清零，切回文档只能从头再滚。
 *
 * 本模块提供共享的纯函数内核：组件层各自持有一个 `Map<tabId, scrollTop>`
 * 实例，切走时 `rememberScrollPosition` 快照、切回时 `recallScrollPosition` 恢复。
 */

/**
 * 快照某 tab 的滚动偏移。
 * 非法输入（空 tabId / 非有限数 / 负数）直接忽略，绝不写入脏值。
 */
export function rememberScrollPosition(
  map: Map<string, number>,
  tabId: string,
  scrollTop: number,
): void {
  if (!tabId) return;
  if (!Number.isFinite(scrollTop) || scrollTop < 0) return;
  map.set(tabId, Math.round(scrollTop));
}

/**
 * 读取某 tab 的滚动偏移；未记录过（首次打开）返回 0（顶部）。
 */
export function recallScrollPosition(
  map: Map<string, number>,
  tabId: string | null,
): number {
  if (!tabId) return 0;
  const value = map.get(tabId);
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}
