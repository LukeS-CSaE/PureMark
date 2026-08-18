/**
 * Minimal text diff (design §2, T02 step 2.8).
 *
 * When the store's copy of a document diverges from what a CodeMirror instance
 * holds, replacing the whole document would destroy the caret, the scroll
 * offset and the undo history. Instead we compute the smallest single-range
 * edit that turns `oldText` into `newText` by stripping the common prefix and
 * the common suffix.
 *
 * This is intentionally NOT a general diff algorithm: a single contiguous
 * change covers every realistic case (typing, paste, formatting command,
 * autosave round-trip) and costs O(n) with no allocation.
 */

export interface MinimalChange {
  /** Start offset of the replaced range in `oldText` (0-based, inclusive). */
  from: number;
  /** End offset of the replaced range in `oldText` (0-based, exclusive). */
  to: number;
  /** Text inserted in place of `[from, to)`. */
  insert: string;
}

/**
 * Compute the smallest single-range replacement between two strings.
 * Returns `null` when the strings are identical (nothing to dispatch).
 */
export function minimalChange(oldText: string, newText: string): MinimalChange | null {
  if (oldText === newText) return null;

  const oldLen = oldText.length;
  const newLen = newText.length;
  const maxPrefix = Math.min(oldLen, newLen);

  // Longest common prefix.
  let prefix = 0;
  while (prefix < maxPrefix && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) {
    prefix += 1;
  }

  // Longest common suffix that does not overlap the prefix on either side.
  const maxSuffix = maxPrefix - prefix;
  let suffix = 0;
  while (
    suffix < maxSuffix &&
    oldText.charCodeAt(oldLen - 1 - suffix) === newText.charCodeAt(newLen - 1 - suffix)
  ) {
    suffix += 1;
  }

  return {
    from: prefix,
    to: oldLen - suffix,
    insert: newText.slice(prefix, newLen - suffix),
  };
}

/* -------------------------------------------------------------------------- */
/* 行级 LCS diff（冲突解决页左右分屏高亮，设计 §1.3 / T02）                       */
/* -------------------------------------------------------------------------- */

/** 一行差异：左/右单元格内容（缺失则为 null = 该行仅存在于另一侧）。 */
export interface DiffLine {
  /** 左侧（磁盘版本）该行内容；null 表示此行仅存在于右侧。 */
  left: string | null;
  /** 右侧（内存版本）该行内容；null 表示此行仅存在于左侧。 */
  right: string | null;
  /** 差异类型：equal / modify / add(仅右) / remove(仅左)。 */
  kind: "equal" | "modify" | "add" | "remove";
}

/**
 * 计算两个文本之间的行级差异（基于 LCS 的动态规划）。
 *
 * 返回按行对齐的 `DiffLine[]`，可直接驱动冲突页的左右双栏渲染：
 *  - `kind === 'equal'`  两侧此行相同；
 *  - `kind === 'modify'` 两侧均存在但内容不同；
 *  - `kind === 'add'`    仅右侧（内存）有；
 *  - `kind === 'remove'` 仅左侧（磁盘）有。
 *
 * 复杂度 O(n·m)，对 Markdown 文档足够；不引入第三方 diff 库。
 */
export function diffLines(a: string, b: string): DiffLine[] {
  const left = a.split("\n");
  const right = b.split("\n");
  const n = left.length;
  const m = right.length;

  // LCS 长度 DP 表（从后往前填，便于回溯）。
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        left[i] === right[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      out.push({ left: left[i], right: right[j], kind: "equal" });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ left: left[i], right: null, kind: "remove" });
      i++;
    } else {
      out.push({ left: null, right: right[j], kind: "add" });
      j++;
    }
  }
  while (i < n) {
    out.push({ left: left[i], right: null, kind: "remove" });
    i++;
  }
  while (j < m) {
    out.push({ left: null, right: right[j], kind: "add" });
    j++;
  }
  return out;
}
