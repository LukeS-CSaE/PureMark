/**
 * 滚轮横向滚动换算纯逻辑测试（TabBar 滚轮横滚）。
 */
import { describe, it, expect } from "vitest";
import { horizontalWheelDelta } from "../lib/wheelToHorizontal";

describe("horizontalWheelDelta", () => {
  it("向下滚（deltaY>0）返回正增量（向右）", () => {
    expect(horizontalWheelDelta(0, 100)).toBe(100);
  });

  it("向上滚（deltaY<0）返回负增量（向左）", () => {
    expect(horizontalWheelDelta(0, -100)).toBe(-100);
  });

  it("触控板横扫（水平分量更大）放行返回 null", () => {
    expect(horizontalWheelDelta(120, 0)).toBeNull();
    expect(horizontalWheelDelta(120, 40)).toBeNull();
    expect(horizontalWheelDelta(-120, -40)).toBeNull();
  });

  it("垂直分量更大时仍转换（斜向滚动取垂直分量）", () => {
    expect(horizontalWheelDelta(30, 90)).toBe(90);
  });

  it("无滚动量返回 null", () => {
    expect(horizontalWheelDelta(0, 0)).toBeNull();
  });
});
