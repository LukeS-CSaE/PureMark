/**
 * T01 config migration — QA independent regression pass (R-20 / S-14).
 *
 * `configMigrate.test.ts` proves each field's fallback in isolation. This file
 * pins the *combined* worst case the QA review flagged: a v2 (configVersion 2)
 * blob in which EVERY iter2-ext field is simultaneously missing, of the wrong
 * type, or holding an out-of-range value. A single self-heal path must turn it
 * into a fully-legal v3 config without throwing and without leaking any bad
 * value through — a green build must not hide a partial migration.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  storeGet: vi.fn(async () => null),
  storeSet: vi.fn(async () => undefined),
}));

const { CONFIG_VERSION, DEFAULT_CONFIG, TOC_WIDTH_MIN, TOC_WIDTH_MAX, migrateConfig } =
  await import("../store/useConfigStore");

const ACCENT_IDS = ["sky", "blue", "green", "purple", "orange", "red", "pink", "custom"];
const THEME_VALUES = ["light", "dark", "auto"];
const VIEW_VALUES = ["edit", "live", "preview"];

/** A v2 blob where every iter2-ext field is broken in a different way. */
const HOSTILE_V2 = {
  configVersion: 2,
  // legacy fields intentionally left off / broken too:
  theme: "solarized", // illegal -> auto
  defaultView: "split", // legacy alias -> live
  fontSize: "big", // illegal -> default
  splitRatio: 99, // out of range -> clamp to 0.8
  paneViewModes: ["split"], // malformed -> [live, preview]
  // iter2-ext fields, all hostile:
  accent: "chartreuse", // illegal id -> sky
  accentCustom: "rgba(0,0,0,1)", // not a hex -> null
  tocVisible: "sure", // non-boolean -> false
  tocPosition: "bottom", // illegal -> right
  tocWidth: -40, // below band -> clamp to min
  window: 12345, // not an object -> default window
};

describe("migrateConfig — hostile v2 blob self-heals to a legal v3 config", () => {
  it("never throws on the worst-case blob", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => migrateConfig(HOSTILE_V2)).not.toThrow();
    warn.mockRestore();
  });

  it("stamps the current schema version", () => {
    expect(migrateConfig(HOSTILE_V2).configVersion).toBe(CONFIG_VERSION);
  });

  it("repairs every iter2-ext field to a meaningful default", () => {
    const c = migrateConfig(HOSTILE_V2);
    expect(c.accent).toBe("sky");
    expect(c.accentCustom).toBeNull();
    expect(c.tocVisible).toBe(false);
    expect(c.tocPosition).toBe("right");
    expect(c.tocWidth).toBe(TOC_WIDTH_MIN);
  });

  it("repairs the broken legacy fields alongside the new ones", () => {
    const c = migrateConfig(HOSTILE_V2);
    expect(c.theme).toBe("auto");
    expect(c.defaultView).toBe("live");
    expect(c.fontSize).toBe(DEFAULT_CONFIG.fontSize);
    expect(c.splitRatio).toBe(0.8);
    expect(c.paneViewModes).toEqual(["live", "preview"]);
    expect(c.window).toEqual(DEFAULT_CONFIG.window);
  });

  it("produces a config whose every field is within its legal domain", () => {
    const c = migrateConfig(HOSTILE_V2);

    // Enumerations.
    expect(THEME_VALUES).toContain(c.theme);
    expect(VIEW_VALUES).toContain(c.defaultView);
    expect(ACCENT_IDS).toContain(c.accent);
    expect(["left", "right"]).toContain(c.tocPosition);
    expect(["single", "split"]).toContain(c.workspaceLayout);

    // Numeric ranges.
    expect(c.splitRatio).toBeGreaterThanOrEqual(0.2);
    expect(c.splitRatio).toBeLessThanOrEqual(0.8);
    expect(c.tocWidth).toBeGreaterThanOrEqual(TOC_WIDTH_MIN);
    expect(c.tocWidth).toBeLessThanOrEqual(TOC_WIDTH_MAX);
    expect(Number.isFinite(c.fontSize)).toBe(true);
    expect(Number.isFinite(c.splitRatio)).toBe(true);

    // Shapes / nullability.
    expect(c.accentCustom === null || typeof c.accentCustom === "string").toBe(true);
    expect(typeof c.tocVisible).toBe("boolean");
    expect(c.paneViewModes).toHaveLength(2);
    for (const m of c.paneViewModes) expect(VIEW_VALUES).toContain(m);
    expect(c.window).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
      maximized: expect.any(Boolean),
    });
  });

  it("preserves a good iter2-ext field while repairing the broken ones around it", () => {
    // Only `accent` is valid here; everything else is garbage. The good value
    // must survive rather than being reset alongside its neighbours.
    const c = migrateConfig({
      configVersion: 2,
      accent: "purple",
      accentCustom: 999,
      tocPosition: "nowhere",
      tocWidth: "wide",
    });
    expect(c.accent).toBe("purple");
    expect(c.accentCustom).toBeNull();
    expect(c.tocPosition).toBe("right");
    expect(c.tocWidth).toBe(DEFAULT_CONFIG.tocWidth);
  });
});
