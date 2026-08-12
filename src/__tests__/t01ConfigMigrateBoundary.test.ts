/**
 * T01 independent boundary tests for `migrateConfig` (iter2-ext, configVersion 3).
 *
 * ADDITIVE to the engineer's `configMigrate.test.ts` — these pin down the edges
 * the first pass did not cover: a v2 blob that is MISSING every new iter2-ext
 * field, the fact that `accent` is strictly an `AccentId` (never a hex), the
 * exact tocWidth/tocPosition boundaries, and the self-heal posture of the legacy
 * `window` (WindowSize) field.
 *
 * The Tauri store bridge is mocked so the pure migration function can be
 * exercised without a Tauri runtime (mirrors the engineer's harness).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  storeGet: vi.fn(async () => null),
  storeSet: vi.fn(async () => undefined),
}));

const {
  CONFIG_VERSION,
  DEFAULT_CONFIG,
  TOC_WIDTH_MIN,
  TOC_WIDTH_MAX,
  migrateConfig,
} = await import("../store/useConfigStore");

describe("migrateConfig — v2 blob WITHOUT the new iter2-ext fields", () => {
  // A realistic iter2 (configVersion 2) blob that omits accent/toc/window.
  const V2_MINIMAL = {
    configVersion: 2,
    theme: "light",
    defaultView: "preview",
  };

  it("stamps configVersion 3", () => {
    expect(CONFIG_VERSION).toBe(3);
    expect(migrateConfig(V2_MINIMAL).configVersion).toBe(3);
  });

  it("backfills every new field with its documented default", () => {
    const c = migrateConfig(V2_MINIMAL);
    expect(c.accent).toBe("sky");
    expect(c.accentCustom).toBeNull();
    expect(c.tocVisible).toBe(false);
    expect(c.tocPosition).toBe("right");
    expect(c.tocWidth).toBe(220);
  });

  it("does not corrupt the legacy fields it actually received", () => {
    const c = migrateConfig(V2_MINIMAL);
    expect(c.theme).toBe("light");
    expect(c.defaultView).toBe("preview");
  });

  it("is silent and safe when the new fields and window are both absent", () => {
    expect(() => migrateConfig(V2_MINIMAL)).not.toThrow();
  });
});

describe("migrateConfig — accent is strictly an AccentId, never a hex", () => {
  it("rejects a hex-looking string and falls back to sky", () => {
    expect(migrateConfig({ accent: "#ff0000" }).accent).toBe("sky");
    expect(migrateConfig({ accent: "0ea5e9" }).accent).toBe("sky");
  });

  it("rejects a near-miss id (case / suffix) and falls back to sky", () => {
    expect(migrateConfig({ accent: "Sky" }).accent).toBe("sky");
    expect(migrateConfig({ accent: "skyblue" }).accent).toBe("sky");
  });
});

describe("migrateConfig — toc boundaries", () => {
  it("preserves exact min and max tocWidth without re-clamping", () => {
    expect(migrateConfig({ tocWidth: TOC_WIDTH_MIN }).tocWidth).toBe(TOC_WIDTH_MIN);
    expect(migrateConfig({ tocWidth: TOC_WIDTH_MAX }).tocWidth).toBe(TOC_WIDTH_MAX);
  });

  it("rounds negative / zero width up to the minimum", () => {
    expect(migrateConfig({ tocWidth: 0 }).tocWidth).toBe(TOC_WIDTH_MIN);
    expect(migrateConfig({ tocWidth: -50 }).tocWidth).toBe(TOC_WIDTH_MIN);
  });

  it("falls back for every illegal tocPosition variant", () => {
    const bad: unknown[] = ["top", "center", "left-right", "", null, 1, {}];
    for (const v of bad) {
      expect(migrateConfig({ tocPosition: v as never }).tocPosition).toBe("right");
    }
  });
});

describe("migrateConfig — legacy window (WindowSize) self-heal", () => {
  it("carries over a valid legacy window and never crashes on a missing `unit`", () => {
    // Pre-iter2-ext `window` records are `WindowSize` (width/height/maximized)
    // and by definition have no `unit`/`schema`. They MUST be KEPT, not
    // discarded — discarding would wipe every upgrading user's window size.
    const legacy = { width: 1024, height: 720, maximized: true };
    expect(migrateConfig({ window: legacy }).window).toEqual({
      width: 1024,
      height: 720,
      maximized: true,
    });
  });

  it("falls back per-field (not wholesale) when individual fields are garbage", () => {
    const c = migrateConfig({ window: { width: "wide", height: {}, maximized: "yes" } });
    expect(c.window.width).toBe(DEFAULT_CONFIG.window.width);
    expect(c.window.height).toBe(DEFAULT_CONFIG.window.height);
    expect(c.window.maximized).toBe(false);
  });

  it("restores the default when window is null / undefined / non-object", () => {
    expect(migrateConfig({ window: null }).window).toEqual(DEFAULT_CONFIG.window);
    expect(migrateConfig({}).window).toEqual(DEFAULT_CONFIG.window);
    expect(migrateConfig({ window: 42 }).window).toEqual(DEFAULT_CONFIG.window);
  });
});

describe("migrateConfig — must not pollute the shared DEFAULT_CONFIG", () => {
  it("leaves DEFAULT_CONFIG untouched after migrating a fully poisoned blob", () => {
    migrateConfig({
      accent: "teal",
      accentCustom: "red",
      tocVisible: "yes",
      tocPosition: "top",
      tocWidth: 9999,
      window: "big",
      theme: "solarized",
    });
    expect(DEFAULT_CONFIG.accent).toBe("sky");
    expect(DEFAULT_CONFIG.accentCustom).toBeNull();
    expect(DEFAULT_CONFIG.tocVisible).toBe(false);
    expect(DEFAULT_CONFIG.tocPosition).toBe("right");
    expect(DEFAULT_CONFIG.tocWidth).toBe(220);
    expect(DEFAULT_CONFIG.window).toEqual({ width: 1200, height: 800, maximized: false });
  });
});
