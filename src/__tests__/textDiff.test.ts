/**
 * Unit tests for `src/lib/textDiff.ts::minimalChange` (T02 step 2.8).
 *
 * Besides the documented cases, every test asserts the *round-trip property*:
 * applying the returned change to `oldText` must reproduce `newText` exactly.
 */
import { describe, expect, it } from "vitest";
import { minimalChange, type MinimalChange } from "../lib/textDiff";

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
