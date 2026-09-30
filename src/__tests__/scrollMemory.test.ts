/**
 * scrollMemory（每文档滚动进度记忆）纯函数测试：
 *  - rememberScrollPosition：快照合法偏移，拒绝空 tabId / 非有限数 / 负数；
 *  - recallScrollPosition：命中返回快照值，未记录 / 空 tabId 返回 0（顶部）。
 */
import { describe, it, expect } from "vitest";
import { rememberScrollPosition, recallScrollPosition } from "../lib/scrollMemory";

describe("rememberScrollPosition", () => {
  it("快照偏移并覆盖同 tab 的旧值", () => {
    const map = new Map<string, number>();
    rememberScrollPosition(map, "tab-1", 320);
    expect(map.get("tab-1")).toBe(320);
    rememberScrollPosition(map, "tab-1", 800);
    expect(map.get("tab-1")).toBe(800);
  });

  it("四舍五入到整数像素", () => {
    const map = new Map<string, number>();
    rememberScrollPosition(map, "tab-1", 320.6);
    expect(map.get("tab-1")).toBe(321);
  });

  it("拒绝空 tabId / 非有限数 / 负数，绝不写入脏值", () => {
    const map = new Map<string, number>();
    rememberScrollPosition(map, "", 100);
    rememberScrollPosition(map, "tab-1", Number.NaN);
    rememberScrollPosition(map, "tab-1", Infinity);
    rememberScrollPosition(map, "tab-1", -5);
    expect(map.size).toBe(0);
  });

  it("不破坏其它 tab 的快照", () => {
    const map = new Map<string, number>();
    rememberScrollPosition(map, "tab-1", 100);
    rememberScrollPosition(map, "tab-2", 500);
    expect(map.get("tab-1")).toBe(100);
    expect(map.get("tab-2")).toBe(500);
  });
});

describe("recallScrollPosition", () => {
  it("命中已记录的 tab", () => {
    const map = new Map<string, number>();
    rememberScrollPosition(map, "tab-1", 640);
    expect(recallScrollPosition(map, "tab-1")).toBe(640);
  });

  it("未记录过的 tab（首次打开）返回 0", () => {
    expect(recallScrollPosition(new Map(), "tab-9")).toBe(0);
  });

  it("空 / null tabId 返回 0", () => {
    const map = new Map<string, number>([["tab-1", 640]]);
    expect(recallScrollPosition(map, null)).toBe(0);
    expect(recallScrollPosition(map, "")).toBe(0);
  });

  it("Map 中的脏值（外部写入）被归零而不是透出", () => {
    const map = new Map<string, number>([
      ["bad-1", Number.NaN],
      ["bad-2", -10],
    ]);
    expect(recallScrollPosition(map, "bad-1")).toBe(0);
    expect(recallScrollPosition(map, "bad-2")).toBe(0);
  });
});
