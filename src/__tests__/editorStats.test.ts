/**
 * Unit tests for the pure statistics function behind the status bar
 * (`src/hooks/useEditorStats.ts::computeStats`).
 * The hook itself is a thin `useMemo` wrapper and is not re-tested here.
 */
import { describe, expect, it } from "vitest";
import { computeStats } from "../hooks/useEditorStats";

describe("computeStats — lines", () => {
  it("reports 1 line for an empty document", () => {
    expect(computeStats("").lines).toBe(1);
  });

  it("reports 1 line for a document without newlines", () => {
    expect(computeStats("hello world").lines).toBe(1);
  });

  it("counts newlines + 1", () => {
    expect(computeStats("a\nb").lines).toBe(2);
    expect(computeStats("a\nb\nc").lines).toBe(3);
  });

  it("counts the trailing empty line after a final newline", () => {
    expect(computeStats("a\n").lines).toBe(2);
  });

  it("counts consecutive blank lines", () => {
    expect(computeStats("\n\n\n").lines).toBe(4);
  });
});

describe("computeStats — chars", () => {
  it("is 0 for an empty document", () => {
    expect(computeStats("").chars).toBe(0);
  });

  it("counts every character including spaces and newlines", () => {
    expect(computeStats("ab c").chars).toBe(4);
    expect(computeStats("a\nb").chars).toBe(3);
  });

  it("counts CJK characters", () => {
    expect(computeStats("你好").chars).toBe(2);
    expect(computeStats("你好 world").chars).toBe(8);
  });

  it("counts punctuation", () => {
    expect(computeStats("a, b.").chars).toBe(5);
  });
});

describe("computeStats — words (CJK-aware)", () => {
  it("is 0 for an empty document", () => {
    expect(computeStats("").words).toBe(0);
  });

  it("is 0 for whitespace only", () => {
    expect(computeStats("   \n\t ").words).toBe(0);
  });

  it("counts latin words", () => {
    expect(computeStats("hello").words).toBe(1);
    expect(computeStats("hello world").words).toBe(2);
    expect(computeStats("one two three four").words).toBe(4);
  });

  it("collapses repeated whitespace between words", () => {
    expect(computeStats("a    b").words).toBe(2);
    expect(computeStats("a\nb\tc").words).toBe(3);
  });

  it("counts numbers as words", () => {
    expect(computeStats("version 2 released").words).toBe(3);
  });

  it("keeps intra-word apostrophes and hyphens as one word", () => {
    expect(computeStats("don't").words).toBe(1);
    expect(computeStats("state-of-the-art").words).toBe(1);
  });

  it("counts each CJK ideograph as one word", () => {
    expect(computeStats("你好").words).toBe(2);
    expect(computeStats("我爱编程").words).toBe(4);
  });

  it("mixes CJK and latin correctly", () => {
    // 2 CJK + 1 latin run
    expect(computeStats("你好 world").words).toBe(3);
    // 4 CJK + 2 latin runs
    expect(computeStats("使用 Markdown 编辑器").words).toBe(6);
  });

  it("ignores CJK punctuation", () => {
    expect(computeStats("你好，世界。").words).toBe(4);
  });

  it("ignores pure symbol runs", () => {
    expect(computeStats("### ---").words).toBe(0);
  });
});

describe("computeStats — shape and stability", () => {
  it("returns exactly lines/words/chars", () => {
    expect(Object.keys(computeStats("x")).sort()).toEqual(["chars", "lines", "words"]);
  });

  it("is deterministic for the same input", () => {
    const doc = "# 标题\n\n正文 with English.\n";
    expect(computeStats(doc)).toEqual(computeStats(doc));
  });

  it("handles a realistic Markdown document", () => {
    const doc = ["# Title", "", "Hello world", "", "- item one", "- item two"].join("\n");
    const s = computeStats(doc);
    expect(s.lines).toBe(6);
    expect(s.chars).toBe(doc.length);
    // Title, Hello, world, item, one, item, two = 7
    expect(s.words).toBe(7);
  });

  it("does not throw on very long input", () => {
    const doc = "word ".repeat(20000);
    expect(() => computeStats(doc)).not.toThrow();
    expect(computeStats(doc).words).toBe(20000);
  });
});
