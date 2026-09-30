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

/** 带双侧行号的差异行（驱动代码差异对比视图，纯数据）。 */
export interface DiffRow extends DiffLine {
  /** 左侧（磁盘）行号（1 起）；该行仅存在于右侧时为空串。 */
  leftNo: string;
  /** 右侧（内存）行号（1 起）；该行仅存在于左侧时为空串。 */
  rightNo: string;
}

/**
 * 给 `diffLines` 的输出补上双侧行号（各自独立递增，缺失侧不占号）。
 * 纯函数：渲染层直接 map 成代码差异对比视图的行。
 */
export function numberDiffRows(lines: readonly DiffLine[]): DiffRow[] {
  const out: DiffRow[] = [];
  let leftNo = 0;
  let rightNo = 0;
  for (const ln of lines) {
    out.push({
      ...ln,
      leftNo: ln.left !== null ? String(++leftNo) : "",
      rightNo: ln.right !== null ? String(++rightNo) : "",
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* 差异分块与逐段取舍（冲突页箭头按钮：按块用磁盘内容覆盖 / 保留我的）       */
/* -------------------------------------------------------------------------- */

/** 逐段取舍：disk = 该块采用磁盘侧内容；mine = 保留内存侧内容。 */
export type HunkChoice = "disk" | "mine";

/** 一段连续差异块（equal 行之间的非 equal 行区间）。 */
export interface DiffHunk {
  /** 块首行在 `diffLines` 输出中的下标（含）。 */
  rowStart: number;
  /** 块末行下标 +1（不含）。 */
  rowEnd: number;
  /** 磁盘侧行内容（按序，不含仅右侧存在的行）。 */
  diskRows: string[];
  /** 内存侧行内容（按序，不含仅左侧存在的行）。 */
  memoryRows: string[];
}

/**
 * 把 `diffLines` 的输出按连续差异分块：相邻的 remove/add/modify 行归为同一块，
 * equal 行作为分界。块下标即逐段取舍 `choices` 数组的下标。
 */
export function groupDiffHunks(lines: readonly DiffLine[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let cur: DiffHunk | null = null;
  lines.forEach((ln, idx) => {
    if (ln.kind === "equal") {
      cur = null;
      return;
    }
    if (!cur) {
      cur = { rowStart: idx, rowEnd: idx, diskRows: [], memoryRows: [] };
      hunks.push(cur);
    }
    cur.rowEnd = idx + 1;
    if (ln.left !== null) cur.diskRows.push(ln.left);
    if (ln.right !== null) cur.memoryRows.push(ln.right);
  });
  return hunks;
}

/**
 * 按每块取舍合成合并结果的行：equal 行原样保留；已决块取所选一侧的行；
 * 未决块默认保留内存侧（未处理 = 保留我的版本）。choices 短于块数时
 * 超出部分视为未决。
 */
export function buildMergedLines(
  lines: readonly DiffLine[],
  hunks: readonly DiffHunk[],
  choices: readonly (HunkChoice | null)[],
): string[] {
  const out: string[] = [];
  let hunkIdx = 0;
  let i = 0;
  while (i < lines.length) {
    const next = hunkIdx < hunks.length ? hunks[hunkIdx] : null;
    if (next && i === next.rowStart) {
      const choice = choices[hunkIdx] ?? null;
      const rows = choice === "disk" ? next.diskRows : next.memoryRows;
      out.push(...rows);
      i = next.rowEnd;
      hunkIdx += 1;
      continue;
    }
    // 块外必为 equal 行（groupDiffHunks 与 diffLines 同源的不变式）。
    out.push((lines[i].left ?? lines[i].right) as string);
    i += 1;
  }
  return out;
}
