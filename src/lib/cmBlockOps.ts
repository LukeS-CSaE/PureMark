/**
 * CM 源码视图的块操作纯逻辑（供 CodeEditor 注册到 blockOpsRegistry）。
 *
 * 源码视图没有文档块节点的概念，这里以「空行分隔的段落」为块单位：
 * 连续的非空行组成一个块，块之间由一个或多个空行隔开。
 *
 * 只依赖 CM6 EditorState + 返回 change 描述，不触碰 EditorView，
 * 可 node 环境单测（与 blockHotkeys.test.ts 的 fake editor 模式同源）。
 */
import type { EditorState } from "@codemirror/state";

export interface CmBlock {
  from: number;
  to: number;
  text: string;
}

/** 取光标所在的段落块（空行分隔）；光标在空行上时取其后最近的块；无块返回 null。 */
export function cmBlockAt(state: EditorState, pos: number): CmBlock | null {
  const doc = state.doc;
  let line = doc.lineAt(Math.min(pos, doc.length));
  // 光标停在空行：向下找最近的非空行作为锚点。
  if (line.text.trim() === "") {
    let found = false;
    for (let n = line.number + 1; n <= doc.lines; n += 1) {
      const cand = doc.line(n);
      if (cand.text.trim() !== "") {
        line = cand;
        found = true;
        break;
      }
    }
    if (!found) return null;
  }
  // 向上扩展到块首（首个空行或文档开头）。
  let first = line.number;
  while (first > 1 && doc.line(first - 1).text.trim() !== "") first -= 1;
  // 向下扩展到块尾。
  let last = line.number;
  while (last < doc.lines && doc.line(last + 1).text.trim() !== "") last += 1;

  const from = doc.line(first).from;
  const to = doc.line(last).to;
  return { from, to, text: doc.sliceString(from, to) };
}

/** 取 `block` 之后（dir=1）/ 之前（dir=-1）的相邻块；没有返回 null。 */
export function cmNeighborBlock(state: EditorState, block: CmBlock, dir: -1 | 1): CmBlock | null {
  const doc = state.doc;
  if (dir === 1) {
    const startLine = doc.lineAt(block.to).number + 1;
    for (let n = startLine; n <= doc.lines; n += 1) {
      const cand = doc.line(n);
      if (cand.text.trim() === "") continue;
      // 找到下一块的首行，向下扩展到块尾。
      let last = n;
      while (last < doc.lines && doc.line(last + 1).text.trim() !== "") last += 1;
      const from = cand.from;
      const to = doc.line(last).to;
      return { from, to, text: doc.sliceString(from, to) };
    }
    return null;
  }
  const startLine = doc.lineAt(block.from).number - 1;
  for (let n = startLine; n >= 1; n -= 1) {
    const cand = doc.line(n);
    if (cand.text.trim() === "") continue;
    // 找到上一块的尾行，向上扩展到块首。
    let first = n;
    while (first > 1 && doc.line(first - 1).text.trim() !== "") first -= 1;
    const from = doc.line(first).from;
    const to = cand.to;
    return { from, to, text: doc.sliceString(from, to) };
  }
  return null;
}

export interface CmBlockChange {
  from: number;
  to: number;
  insert: string;
  /** 操作后光标应落在的位置（副本内 / 随块移动后的位置）。 */
  cursor: number;
}

/** 复制当前块到正下方（以一个空行隔开），光标落入副本。 */
export function cmDuplicateDown(state: EditorState, pos: number): CmBlockChange | null {
  const block = cmBlockAt(state, pos);
  if (!block) return null;
  // 在块尾插入「空行 + 副本」；副本起点 = block.to + "\n\n".length。
  const insert = "\n\n" + block.text;
  return { from: block.to, to: block.to, insert, cursor: block.to + 2 };
}

/** 当前块与相邻块交换；返回整体替换区间的 change，光标随块移动。 */
export function cmMoveBlock(state: EditorState, pos: number, dir: -1 | 1): CmBlockChange | null {
  const block = cmBlockAt(state, pos);
  if (!block) return null;
  const neighbor = cmNeighborBlock(state, block, dir);
  if (!neighbor) return null;

  const offset = Math.min(pos, block.to) - block.from;
  if (dir === 1) {
    // [A][B] → [B][A]：替换 [A.from, B.to]。
    const insert = neighbor.text + "\n\n" + block.text;
    const cursor = block.from + neighbor.text.length + 2 + offset;
    return { from: block.from, to: neighbor.to, insert, cursor };
  }
  // [B][A] → [A][B]：替换 [B.from, A.to]，当前块前移到 B 的起点。
  const insert = block.text + "\n\n" + neighbor.text;
  return { from: neighbor.from, to: block.to, insert, cursor: neighbor.from + offset };
}
