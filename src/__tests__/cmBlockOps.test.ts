/**
 * CM 源码视图块操作纯逻辑测试（无需 DOM，直接对 EditorState 求值）。
 *
 * 覆盖：
 * - cmBlockAt：空行分隔的段落块定位、空行光标回退、空文档返回 null；
 * - cmDuplicateDown：副本以空行隔开插入当前块正下方；
 * - cmMoveBlock：上/下移交换相邻块（含多行块），边界返回 null。
 */
import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  cmBlockAt,
  cmDuplicateDown,
  cmMoveBlock,
} from "../lib/cmBlockOps";

const st = (doc: string, pos: number) => ({
  state: EditorState.create({ doc }),
  pos,
});

/** 应用 change 得到新文档文本。 */
function apply(doc: string, change: { from: number; to: number; insert: string }): string {
  const next = EditorState.create({ doc }).update({ changes: change }).state;
  return next.doc.toString();
}

describe("cmBlockAt", () => {
  it("返回光标所在段落块（空行分隔）", () => {
    const { state } = st("aaa\n\nbbb\n\nccc", 6); // 光标在 bbb 内
    const block = cmBlockAt(state, 6);
    expect(block).not.toBeNull();
    expect(block!.text).toBe("bbb");
  });

  it("多行连续文本视为同一个块", () => {
    const { state } = st("a1\na2\n\nb1", 4); // 光标在 a2
    const block = cmBlockAt(state, 4);
    expect(block!.text).toBe("a1\na2");
  });

  it("光标在空行时取其后最近的块", () => {
    const { state } = st("aaa\n\nbbb", 4); // 空行位置
    const block = cmBlockAt(state, 4);
    expect(block!.text).toBe("bbb");
  });

  it("空文档返回 null", () => {
    const { state } = st("", 0);
    expect(cmBlockAt(state, 0)).toBeNull();
  });
});

describe("cmDuplicateDown", () => {
  it("副本以空行隔开插入当前块正下方", () => {
    const doc = "aaa\n\nbbb";
    const { state, pos } = st(doc, 1);
    const change = cmDuplicateDown(state, pos);
    expect(change).not.toBeNull();
    expect(apply(doc, change!)).toBe("aaa\n\naaa\n\nbbb");
  });

  it("多行块整体复制", () => {
    const doc = "a1\na2\n\nb";
    const { state } = st(doc, 4);
    const change = cmDuplicateDown(state, 4)!;
    expect(apply(doc, change)).toBe("a1\na2\n\na1\na2\n\nb");
  });

  it("光标落入副本起点", () => {
    const doc = "aaa\n\nbbb";
    const { state } = st(doc, 1);
    const change = cmDuplicateDown(state, 1)!;
    // 副本起点 = 原块尾(3) + "\n\n"(2) = 5。
    expect(change.cursor).toBe(5);
  });
});

describe("cmMoveBlock", () => {
  it("下移：与下一块交换", () => {
    const doc = "aaa\n\nbbb\n\nccc";
    const { state } = st(doc, 1);
    const change = cmMoveBlock(state, 1, 1)!;
    expect(apply(doc, change)).toBe("bbb\n\naaa\n\nccc");
  });

  it("上移：与上一块交换", () => {
    const doc = "aaa\n\nbbb";
    const { state } = st(doc, 6); // 光标在 bbb
    const change = cmMoveBlock(state, 6, -1)!;
    expect(apply(doc, change)).toBe("bbb\n\naaa");
  });

  it("多行块整体交换", () => {
    const doc = "a1\na2\n\nb1\nb2";
    const { state } = st(doc, 1);
    const change = cmMoveBlock(state, 1, 1)!;
    expect(apply(doc, change)).toBe("b1\nb2\n\na1\na2");
  });

  it("光标随块移动（保持块内偏移）", () => {
    const doc = "aaa\n\nbbb";
    const { state } = st(doc, 2); // 光标在 aaa 内偏移 2
    const change = cmMoveBlock(state, 2, 1)!;
    // 交换后 aaa 起点 = "bbb\n\n".length = 5，光标 = 5 + 2 = 7。
    expect(change.cursor).toBe(7);
  });

  it("首块上移 / 末块下移返回 null", () => {
    const doc = "aaa\n\nbbb";
    const s0 = st(doc, 1);
    expect(cmMoveBlock(s0.state, 1, -1)).toBeNull();
    const s1 = st(doc, 6);
    expect(cmMoveBlock(s1.state, 6, 1)).toBeNull();
  });
});
