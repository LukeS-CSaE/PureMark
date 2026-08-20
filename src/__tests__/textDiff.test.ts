/**
 * Unit tests for `src/lib/textDiff.ts`：
 *  - `minimalChange`（T02 step 2.8）：单段最小编辑 + round-trip 性质；
 *  - `diffLines`：行级 LCS 对齐（equal / remove / add），左右可还原原文；
 *  - `numberDiffRows`：双侧行号各自独立递增，缺失侧不占号；
 *  - `groupDiffHunks` / `buildMergedLines`：差异分块与逐段取舍合成。
 */
import { describe, expect, it } from "vitest";
import {
  buildMergedLines,
  diffLines,
  groupDiffHunks,
  minimalChange,
  numberDiffRows,
  type MinimalChange,
} from "../lib/textDiff";

/** Apply a change the same way CodeMirror would. */
function apply(oldText: string, c: MinimalChange): string {
  return oldText.slice(0, c.from) + c.insert + oldText.slice(c.to);
}

function expectRoundTrip(oldText: string, newText: string): MinimalChange {
  const c = minimalChange(oldText, newText);
  expect(c).not.toBeNull();
  const change = c as MinimalChange;
  expect(apply(oldText, change)).toBe(newText);
  expect(change.from).toBeGreaterThanOrEqual(0);
  expect(change.to).toBeGreaterThanOrEqual(change.from);
  expect(change.to).toBeLessThanOrEqual(oldText.length);
  return change;
}

describe("minimalChange — no change", () => {
  it("returns null for identical strings", () => {
    expect(minimalChange("hello", "hello")).toBeNull();
  });

  it("returns null for two empty strings", () => {
    expect(minimalChange("", "")).toBeNull();
  });
});

describe("minimalChange — insertion", () => {
  it("detects an insertion at the head", () => {
    const c = expectRoundTrip("world", "hello world");
    expect(c).toEqual({ from: 0, to: 0, insert: "hello " });
  });

  it("detects an insertion in the middle", () => {
    const c = expectRoundTrip("ab", "aXb");
    expect(c).toEqual({ from: 1, to: 1, insert: "X" });
  });

  it("detects an insertion at the tail", () => {
    const c = expectRoundTrip("hello", "hello world");
    expect(c).toEqual({ from: 5, to: 5, insert: " world" });
  });

  it("detects a newline insertion (Enter key)", () => {
    const c = expectRoundTrip("# Title", "# Title\n");
    expect(c).toEqual({ from: 7, to: 7, insert: "\n" });
  });

  it("handles insertion into an empty document", () => {
    const c = expectRoundTrip("", "a");
    expect(c).toEqual({ from: 0, to: 0, insert: "a" });
  });
});

describe("minimalChange — deletion", () => {
  it("detects a deletion at the head", () => {
    const c = expectRoundTrip("hello world", "world");
    expect(c).toEqual({ from: 0, to: 6, insert: "" });
  });

  it("detects a deletion in the middle", () => {
    const c = expectRoundTrip("aXb", "ab");
    expect(c).toEqual({ from: 1, to: 2, insert: "" });
  });

  it("detects a deletion at the tail (backspace)", () => {
    const c = expectRoundTrip("hello!", "hello");
    expect(c).toEqual({ from: 5, to: 6, insert: "" });
  });

  it("handles clearing the whole document", () => {
    const c = expectRoundTrip("hello", "");
    expect(c).toEqual({ from: 0, to: 5, insert: "" });
  });
});

describe("minimalChange — replacement", () => {
  it("detects a middle replacement", () => {
    const c = expectRoundTrip("hello world", "hello brave world");
    expect(apply("hello world", c)).toBe("hello brave world");
  });

  it("detects a full replacement with no common affixes", () => {
    const c = expectRoundTrip("abc", "xyz");
    expect(c).toEqual({ from: 0, to: 3, insert: "xyz" });
  });

  it("handles a markdown formatting command (bold)", () => {
    const c = expectRoundTrip("make this bold", "make **this** bold");
    expect(apply("make this bold", c)).toBe("make **this** bold");
  });
});

describe("minimalChange — affix overlap safety", () => {
  it("does not let the prefix and suffix overlap when repeating characters", () => {
    const c = expectRoundTrip("aaa", "aa");
    expect(c.to - c.from).toBe(1);
    expect(c.insert).toBe("");
  });

  it("handles growing a run of identical characters", () => {
    const c = expectRoundTrip("aa", "aaa");
    expect(c.insert).toBe("a");
    expect(c.from).toBe(c.to);
  });

  it("handles a long repeated run", () => {
    expectRoundTrip("x".repeat(50), "x".repeat(49));
    expectRoundTrip("x".repeat(49), "x".repeat(50));
  });
});

describe("minimalChange — unicode & multiline", () => {
  it("handles CJK text", () => {
    const c = expectRoundTrip("你好世界", "你好美丽世界");
    expect(c.insert).toBe("美丽");
  });

  it("handles a multi-line edit", () => {
    const oldText = "line1\nline2\nline3";
    const newText = "line1\nline2 edited\nline3";
    const c = expectRoundTrip(oldText, newText);
    expect(c.insert).toBe(" edited");
  });

  it("handles emoji (surrogate pairs) without corrupting the round trip", () => {
    expectRoundTrip("a🙂b", "a🙂🙂b");
    expectRoundTrip("hello", "hello 🎉");
  });
});

/* -------------------------------------------------------------------------- */
/* 行级 LCS diff（冲突差异对比视图）                                            */
/* -------------------------------------------------------------------------- */

describe("diffLines", () => {
  it("相同文本全部 equal", () => {
    const lines = diffLines("a\nb\nc", "a\nb\nc");
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.kind === "equal")).toBe(true);
  });

  it("删除行仅出现在左侧（remove）", () => {
    const lines = diffLines("a\nb\nc", "a\nc");
    const removed = lines.find((l) => l.kind === "remove");
    expect(removed?.left).toBe("b");
    expect(removed?.right).toBe(null);
  });

  it("新增行仅出现在右侧（add）", () => {
    const lines = diffLines("a\nc", "a\nb\nc");
    const added = lines.find((l) => l.kind === "add");
    expect(added?.left).toBe(null);
    expect(added?.right).toBe("b");
  });

  it("左右内容可各自还原原文", () => {
    const a = "# 标题\n\n旧段落\n结尾";
    const b = "# 标题\n\n新段落\n补充行\n结尾";
    const lines = diffLines(a, b);
    expect(lines.filter((l) => l.left !== null).map((l) => l.left).join("\n")).toBe(a);
    expect(lines.filter((l) => l.right !== null).map((l) => l.right).join("\n")).toBe(b);
  });
});

describe("numberDiffRows", () => {
  it("双侧行号各自独立递增，缺失侧不占号", () => {
    // 磁盘:a b c → 内存:a x c（删 b 增 x）
    const rows = numberDiffRows(diffLines("a\nb\nc", "a\nx\nc"));
    const leftNos = rows.map((r) => r.leftNo);
    const rightNos = rows.map((r) => r.rightNo);
    // 左侧 a=1、b=2、c=3；被删行右侧不占号。
    expect(leftNos.filter(Boolean)).toEqual(["1", "2", "3"]);
    expect(rightNos.filter(Boolean)).toEqual(["1", "2", "3"]);
    const removed = rows.find((r) => r.kind === "remove")!;
    expect(removed.leftNo).toBe("2");
    expect(removed.rightNo).toBe("");
    const added = rows.find((r) => r.kind === "add")!;
    expect(added.leftNo).toBe("");
    expect(added.rightNo).toBe("2");
  });

  it("equal 行两侧同号", () => {
    const rows = numberDiffRows(diffLines("a\nb", "a\nb"));
    expect(rows.map((r) => [r.leftNo, r.rightNo])).toEqual([
      ["1", "1"],
      ["2", "2"],
    ]);
  });

  it("空输入返回空数组", () => {
    expect(numberDiffRows([])).toEqual([]);
  });
});

describe("groupDiffHunks", () => {
  it("无差异时返回空数组", () => {
    expect(groupDiffHunks(diffLines("a\nb", "a\nb"))).toEqual([]);
  });

  it("相邻的 remove/add 行归为同一块，equal 行分块", () => {
    // 磁盘 a b c d e → 内存 a X c Y e：两块差异，中间由 equal 行 c 分隔。
    const diff = diffLines("a\nb\nc\nd\ne", "a\nX\nc\nY\ne");
    const hunks = groupDiffHunks(diff);
    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toMatchObject({
      diskRows: ["b"],
      memoryRows: ["X"],
    });
    expect(hunks[1]).toMatchObject({
      diskRows: ["d"],
      memoryRows: ["Y"],
    });
    // 块区间不覆盖 equal 行，且前后相接有序。
    expect(diff[hunks[0].rowStart].kind).not.toBe("equal");
    expect(diff[hunks[0].rowEnd - 1].kind).not.toBe("equal");
    expect(diff[hunks[0].rowEnd].kind).toBe("equal");
    expect(hunks[1].rowStart).toBeGreaterThan(hunks[0].rowEnd - 1);
  });

  it("纯新增 / 纯删除块的缺失侧行不进另一侧数组", () => {
    // 磁盘 a b → 内存 a b c：仅一块纯新增。
    const added = groupDiffHunks(diffLines("a\nb", "a\nb\nc"));
    expect(added).toHaveLength(1);
    expect(added[0].diskRows).toEqual([]);
    expect(added[0].memoryRows).toEqual(["c"]);
    // 磁盘 a b c → 内存 a b：仅一块纯删除。
    const removed = groupDiffHunks(diffLines("a\nb\nc", "a\nb"));
    expect(removed).toHaveLength(1);
    expect(removed[0].diskRows).toEqual(["c"]);
    expect(removed[0].memoryRows).toEqual([]);
  });
});

describe("buildMergedLines", () => {
  const disk = "a\nb\nc\nd\ne";
  const memory = "a\nX\nc\nY\ne";

  it("全部未决时保留内存侧（等于内存原文）", () => {
    const diff = diffLines(disk, memory);
    const hunks = groupDiffHunks(diff);
    expect(buildMergedLines(diff, hunks, []).join("\n")).toBe(memory);
  });

  it("逐块采用磁盘：仅被选中的块被磁盘行替换", () => {
    const diff = diffLines(disk, memory);
    const hunks = groupDiffHunks(diff);
    // 只把第一块换成磁盘的 b，第二块保留我的 Y。
    expect(buildMergedLines(diff, hunks, ["disk", null]).join("\n")).toBe("a\nb\nc\nY\ne");
    // 反过来：第一块保留 X，第二块采用磁盘的 d。
    expect(buildMergedLines(diff, hunks, ["mine", "disk"]).join("\n")).toBe("a\nX\nc\nd\ne");
    // 全部采用磁盘 → 磁盘原文。
    expect(buildMergedLines(diff, hunks, ["disk", "disk"]).join("\n")).toBe(disk);
  });

  it("纯新增块采用磁盘 → 该段不保留任何行", () => {
    const diff = diffLines("a\nb", "a\nb\nc");
    const hunks = groupDiffHunks(diff);
    expect(buildMergedLines(diff, hunks, ["disk"]).join("\n")).toBe("a\nb");
  });

  it("choices 短于块数时超出部分视为未决", () => {
    const diff = diffLines(disk, memory);
    const hunks = groupDiffHunks(diff);
    expect(buildMergedLines(diff, hunks, ["disk"]).join("\n")).toBe("a\nb\nc\nY\ne");
  });
});
