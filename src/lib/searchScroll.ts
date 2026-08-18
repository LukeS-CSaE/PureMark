/**
 * 搜索跳转的滚动 + 文本定位工具（DOM 相关，仅前端运行时使用）。
 *
 * 与 `search.ts` 的纯函数部分分离，便于在 node 环境下单独测试纯逻辑。
 *
 * 定位策略：不再用 markdown 行号做「软提示」挑块 —— 行号与 DOM「顶层块序号」
 * 天然错位（多行段落 / 标题 / 列表都会让二者不相等），且同一块内重复匹配时
 * 无法区分，正是「点第 N 项却跳到第 N±1 个匹配」索引偏移的根源。现改为直接
 * 按「这是全文第几个匹配（ordinal，0-based）」在 DOM 文本里精确挑选，与
 * `findMatches` 在 markdown 源码里按出现顺序编号的结果一一对应。
 *
 * 滚动策略：移除「停在视口第 4 行 / 前 3 行贴顶 / 末尾滚不到位」的行号限制，
 * 直接把匹配所在块滚入视口（顶部留少量余量）。
 */

/** 搜索跳转后匹配行停在视口的第几行（仅 CM6 视图沿用此目标，1-based）。 */
export const SEARCH_TARGET_LINE = 4;

export interface LocatedMatch {
  node: Text;
  start: number;
  end: number;
}

/**
 * 在 `root` 内定位第 `ordinal` 个（0-based）`matchText` 出现。
 *
 * 按文档顺序遍历所有文本节点并收集全部出现，取第 ordinal 个。文档遍历顺序与
 * `findMatches` 在 markdown 源码里的编号顺序一致，保证点击结果列表第 N 项时
 * 精确定位到第 N 个匹配；ordinal 越界时 clamp 到首/末个，绝不返回 null 之外
 * 的错误目标。
 *
 * @param root      搜索根节点（编辑器 / 预览的渲染容器）
 * @param ordinal   目标匹配在所有匹配中的序号（0-based，即结果列表下标）
 * @param matchText 匹配的原始文本（取自 markdown `content.slice(start, end)`）
 */
export function locateMatchText(
  root: HTMLElement,
  ordinal: number,
  matchText: string,
): LocatedMatch | null {
  if (!matchText) return null;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.textContent && n.textContent.length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });

  const all: LocatedMatch[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const text = node.textContent ?? "";
    // 一个文本节点里可能含多个 matchText（一行内重复查询词），全部收集，
    // 从 = idx + len 保持与 findMatches 一致的「不重叠」步进。
    let from = 0;
    for (;;) {
      const idx = text.indexOf(matchText, from);
      if (idx === -1) break;
      all.push({ node, start: idx, end: idx + matchText.length });
      from = idx + matchText.length;
      if (from >= text.length) break;
    }
  }

  if (all.length === 0) return null;
  const i = Math.max(0, Math.min(ordinal, all.length - 1));
  return all[i];
}

/** 找到真正可滚动的祖先（overflow 允许且确有溢出内容）。 */
export function findScrollContainer(el: HTMLElement): HTMLElement {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const s = getComputedStyle(node);
    const scrollable =
      s.overflowY === "auto" || s.overflowY === "scroll" || s.overflowY === "overlay";
    if (scrollable && node.scrollHeight > node.clientHeight + 1) return node;
    node = node.parentElement;
  }
  return el;
}

/**
 * 把 `block` 直接滚入视口（顶部留 `topPadding` 像素余量）。
 *
 * 取代原先「停在第 targetLine 行」的行号换算：不再测行高、不再做
 * `(targetLine-1)*lineHeight` 偏移，直接把匹配所在块顶对齐容器顶（带余量）。
 * 内容未溢出时直接返回（无需滚动）。
 */
export function scrollBlockIntoView(block: HTMLElement, topPadding = 8): void {
  const container = findScrollContainer(block);
  if (container.scrollHeight <= container.clientHeight + 1) return;
  const cRect = container.getBoundingClientRect();
  const bRect = block.getBoundingClientRect();
  const topInContent = bRect.top - cRect.top + container.scrollTop;
  container.scrollTop = Math.max(0, topInContent - topPadding);
}

/**
 * 定位第 `ordinal` 个匹配并直接滚动到位，返回定位结果（供调用方复用做高亮，
 * 保证「滚动」与「高亮」严格落在同一处，不再各自定位导致错位）。
 *
 * @param root      搜索根节点
 * @param ordinal   目标匹配序号（0-based，即结果列表下标）
 * @param matchText 匹配的原始文本
 * @returns 定位结果；未找到匹配时返回 null。
 */
export function scrollToMatchOrdinal(
  root: HTMLElement,
  ordinal: number,
  matchText: string,
): LocatedMatch | null {
  const located = locateMatchText(root, ordinal, matchText);
  if (!located) return null;
  const block = located.node.parentElement ?? root;
  scrollBlockIntoView(block);
  return located;
}
