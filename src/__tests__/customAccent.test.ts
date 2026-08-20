/**
 * 自定义主题色（新增 / 删除，总数上限 10）纯函数与迁移校验测试。
 *
 * 覆盖 theme.ts 的 normalizeAccentHex / appendCustomAccent / removeCustomAccent，
 * 以及 useConfigStore.migrateConfig 对 customAccents 的清洗（非法值过滤、
 * 归一化、去重、槽位截断、缺省回填）。
 */
import { describe, expect, it, vi } from "vitest";
import {
  ACCENT_PRESETS,
  CUSTOM_ACCENT_SLOTS,
  MAX_ACCENT_COUNT,
  appendCustomAccent,
  normalizeAccentHex,
  removeCustomAccent,
} from "../lib/theme";

// 与既有 configMigrate 系列同款：mock 掉 Tauri 桥，node 环境直接跑纯函数。
vi.mock("../lib/tauri", () => ({
  storeGet: vi.fn(async () => null),
  storeSet: vi.fn(async () => undefined),
}));

const { migrateConfig } = await import("../store/useConfigStore");

/* ------------------------------------------------------------------ *
 * 常量契约
 * ------------------------------------------------------------------ */

describe("主题色上限契约", () => {
  it("总数上限为 10，自定义槽位 = 10 − 内置预设数", () => {
    expect(MAX_ACCENT_COUNT).toBe(10);
    expect(CUSTOM_ACCENT_SLOTS).toBe(MAX_ACCENT_COUNT - ACCENT_PRESETS.length);
    expect(CUSTOM_ACCENT_SLOTS).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * normalizeAccentHex
 * ------------------------------------------------------------------ */

describe("normalizeAccentHex", () => {
  it("归一化 6 位 hex 为小写 #rrggbb", () => {
    expect(normalizeAccentHex("#FF00AA")).toBe("#ff00aa");
    expect(normalizeAccentHex("0EA5E9")).toBe("#0ea5e9");
  });

  it("展开 3 位简写", () => {
    expect(normalizeAccentHex("#f0a")).toBe("#ff00aa");
  });

  it("拒绝非法输入", () => {
    expect(normalizeAccentHex("#ffffff80")).toBeNull();
    expect(normalizeAccentHex("not-a-color")).toBeNull();
    expect(normalizeAccentHex("")).toBeNull();
    expect(normalizeAccentHex(null)).toBeNull();
    expect(normalizeAccentHex(42)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * appendCustomAccent
 * ------------------------------------------------------------------ */

describe("appendCustomAccent", () => {
  it("追加归一化后的 hex", () => {
    expect(appendCustomAccent([], "#ABCDEF")).toEqual(["#abcdef"]);
  });

  it("不修改原数组（始终返回新数组）", () => {
    const src = ["#111111"];
    const out = appendCustomAccent(src, "#222222");
    expect(src).toEqual(["#111111"]);
    expect(out).toEqual(["#111111", "#222222"]);
  });

  it("列表内重复时不追加", () => {
    expect(appendCustomAccent(["#abcdef"], "#ABCDEF")).toEqual(["#abcdef"]);
  });

  it("与内置预设重复时不追加（大小写不敏感）", () => {
    expect(appendCustomAccent([], "#0EA5E9")).toEqual([]); // sky
    expect(appendCustomAccent([], "#0071e3")).toEqual([]); // azure
  });

  it("非法 hex 不追加", () => {
    expect(appendCustomAccent(["#111111"], "garbage")).toEqual(["#111111"]);
  });

  it("超出剩余槽位时不再追加", () => {
    const full = Array.from({ length: CUSTOM_ACCENT_SLOTS }, (_, i) =>
      `#${(i + 1).toString(16).padStart(2, "0")}11111`,
    );
    expect(full).toHaveLength(CUSTOM_ACCENT_SLOTS);
    expect(appendCustomAccent(full, "#999999")).toEqual(full);
  });
});

/* ------------------------------------------------------------------ *
 * removeCustomAccent
 * ------------------------------------------------------------------ */

describe("removeCustomAccent", () => {
  it("移除指定 hex，其余顺序不变", () => {
    expect(removeCustomAccent(["#aaaaaa", "#bbbbbb", "#cccccc"], "#bbbbbb")).toEqual([
      "#aaaaaa",
      "#cccccc",
    ]);
  });

  it("不存在时返回等值新数组", () => {
    const src = ["#aaaaaa"];
    const out = removeCustomAccent(src, "#ffffff");
    expect(out).toEqual(src);
    expect(out).not.toBe(src);
  });
});

/* ------------------------------------------------------------------ *
 * migrateConfig — customAccents 清洗
 * ------------------------------------------------------------------ */

describe("migrateConfig — customAccents", () => {
  it("缺省时回填空数组", () => {
    expect(migrateConfig({}).customAccents).toEqual([]);
    expect(migrateConfig(null).customAccents).toEqual([]);
  });

  it("过滤非法值、归一化小写并去重", () => {
    const c = migrateConfig({
      customAccents: ["#ABCDEF", "#abcdef", "garbage", "#ffffff80", 7, null],
    });
    expect(c.customAccents).toEqual(["#abcdef"]);
  });

  it("剔除与内置预设重复的项", () => {
    const c = migrateConfig({ customAccents: ["#0ea5e9", "#222222"] });
    expect(c.customAccents).toEqual(["#222222"]);
  });

  it("超长列表截断到剩余槽位（总数 ≤ 10）", () => {
    const many = Array.from({ length: 8 }, (_, i) => `#${i + 1}${i + 1}2233`);
    const c = migrateConfig({ customAccents: many });
    expect(c.customAccents).toHaveLength(CUSTOM_ACCENT_SLOTS);
    expect(ACCENT_PRESETS.length + c.customAccents.length).toBeLessThanOrEqual(MAX_ACCENT_COUNT);
  });
});
