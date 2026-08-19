/**
 * 滚轮 → 水平滚动换算（TabBar 等横向条带使用）。
 *
 * 垂直滚轮映射为水平滚动（向下 → 向右、向上 → 向左）；触控板等
 * 本身已产生横向分量的输入则放行（返回 null），由浏览器原生处理。
 * 纯函数，node 环境可测。
 */

/**
 * 返回应施加到 scrollLeft 的增量；返回 null 表示不拦截该滚轮事件。
 * 判定：垂直分量大于水平分量才转换，否则放行（如触控板横扫）。
 */
export function horizontalWheelDelta(deltaX: number, deltaY: number): number | null {
  if (Math.abs(deltaY) <= Math.abs(deltaX)) return null;
  return deltaY;
}
