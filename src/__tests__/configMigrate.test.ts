/**
 * Unit tests for `migrateConfig` (R-20, design §3.2 rule table).
 *
 * The Tauri store bridge is mocked away so the pure migration function can be
 * exercised without a Tauri runtime.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  storeGet: vi.fn(async () => null),
  storeSet: vi.fn(async () => undefined),
}));

const { CONFIG_VERSION, DEFAULT_CONFIG, migrateConfig } = await import(
  "../store/useConfigStore"
);

describe("migrateConfig — fresh install", () => {
  it("returns the defaults for null", () => {
    const c = migrateConfig(null);
    expect(c.theme).toBe("auto");
    expect(c.defaultView).toBe("live");
    expect(c.configVersion).toBe(CONFIG_VERSION);
  });

  it("returns the defaults for undefined", () => {
    expect(migrateConfig(undefined).theme).toBe("auto");
  });

  it("returns the defaults for non-object input", () => {
    expect(migrateConfig("nope").defaultView).toBe("live");
    expect(migrateConfig(42).defaultView).toBe("live");
    expect(migrateConfig([1, 2, 3]).defaultView).toBe("live");
  });

  it("does not alias the shared DEFAULT_CONFIG sub-objects", () => {
    const a = migrateConfig(null);
    a.window.width = 1;
    a.recentFiles.push("x");
    expect(DEFAULT_CONFIG.window.width).not.toBe(1);
    expect(DEFAULT_CONFIG.recentFiles).toHaveLength(0);
  });
});

describe("migrateConfig — theme", () => {
  it("keeps an existing light preference (old users are not forced to auto)", () => {
    expect(migrateConfig({ theme: "light" }).theme).toBe("light");
  });

  it("keeps an existing dark preference", () => {
    expect(migrateConfig({ theme: "dark" }).theme).toBe("dark");
  });

  it("keeps auto", () => {
    expect(migrateConfig({ theme: "auto" }).theme).toBe("auto");
  });

  it("falls back to auto for an illegal value", () => {
    expect(migrateConfig({ theme: "solarized" }).theme).toBe("auto");
    expect(migrateConfig({ theme: 7 }).theme).toBe("auto");
  });

  it("falls back to auto when missing", () => {
    expect(migrateConfig({ fontSize: 16 }).theme).toBe("auto");
  });
});

describe("migrateConfig — defaultView", () => {
  it("maps the removed 'split' mode to 'live'", () => {
    expect(migrateConfig({ defaultView: "split" }).defaultView).toBe("live");
  });

  it("keeps edit / live / preview", () => {
    expect(migrateConfig({ defaultView: "edit" }).defaultView).toBe("edit");
    expect(migrateConfig({ defaultView: "live" }).defaultView).toBe("live");
    expect(migrateConfig({ defaultView: "preview" }).defaultView).toBe("preview");
  });

  it("falls back to live for an illegal or missing value", () => {
    expect(migrateConfig({ defaultView: "zen" }).defaultView).toBe("live");
    expect(migrateConfig({}).defaultView).toBe("live");
  });

  it("migrates the documented legacy blob without throwing", () => {
    const legacy = { theme: "light", defaultView: "split", fontSize: 15 };
    const c = migrateConfig(legacy);
    expect(c.theme).toBe("light");
    expect(c.defaultView).toBe("live");
    expect(c.fontSize).toBe(15);
  });
});

describe("migrateConfig — new iter2 fields", () => {
  it("fills workspaceLayout / splitRatio / paneViewModes when missing", () => {
    const c = migrateConfig({ theme: "dark" });
    expect(c.workspaceLayout).toBe("single");
    expect(c.splitRatio).toBe(0.5);
    expect(c.paneViewModes).toHaveLength(2);
  });

  it("keeps a persisted split layout", () => {
    expect(migrateConfig({ workspaceLayout: "split" }).workspaceLayout).toBe("split");
  });

  it("rejects an unknown layout value", () => {
    expect(migrateConfig({ workspaceLayout: "grid" }).workspaceLayout).toBe("single");
  });

  it("clamps an out-of-range splitRatio", () => {
    expect(migrateConfig({ splitRatio: 0 }).splitRatio).toBe(0.2);
    expect(migrateConfig({ splitRatio: 1 }).splitRatio).toBe(0.8);
    expect(migrateConfig({ splitRatio: -5 }).splitRatio).toBe(0.2);
    expect(migrateConfig({ splitRatio: 0.35 }).splitRatio).toBeCloseTo(0.35, 5);
  });

  it("falls back for a non-numeric splitRatio", () => {
    expect(migrateConfig({ splitRatio: "wide" }).splitRatio).toBe(0.5);
    expect(migrateConfig({ splitRatio: Number.NaN }).splitRatio).toBe(0.5);
  });

  it("normalises legacy 'split' inside paneViewModes", () => {
    expect(migrateConfig({ paneViewModes: ["split", "preview"] }).paneViewModes).toEqual([
      "live",
      "preview",
    ]);
  });

  it("repairs a malformed paneViewModes array", () => {
    expect(migrateConfig({ paneViewModes: ["edit"] }).paneViewModes).toEqual([
      "live",
      "preview",
    ]);
    expect(migrateConfig({ paneViewModes: "edit" }).paneViewModes).toEqual([
      "live",
      "preview",
    ]);
  });

  it("seeds paneViewModes[0] from the user's defaultView when absent", () => {
    expect(migrateConfig({ defaultView: "edit" }).paneViewModes[0]).toBe("edit");
  });

  it("always stamps the current schema version", () => {
    expect(migrateConfig({ configVersion: 1 }).configVersion).toBe(CONFIG_VERSION);
  });
});

describe("migrateConfig — legacy scalar fields survive", () => {
  it("carries over fonts, sidebar, folder, recents, window and autosave", () => {
    const c = migrateConfig({
      fontFamily: "Fira Code",
      fontSize: 18,
      sidebarVisible: false,
      sidebarWidth: 300,
      lastFolder: "/root/notes",
      recentFiles: ["/root/a.md", 12, "/root/b.md"],
      window: { width: 1000, height: 700, maximized: true },
      autoSave: false,
      autoSaveDelay: 1500,
    });

    expect(c.fontFamily).toBe("Fira Code");
    expect(c.fontSize).toBe(18);
    expect(c.sidebarVisible).toBe(false);
    expect(c.sidebarWidth).toBe(300);
    expect(c.lastFolder).toBe("/root/notes");
    expect(c.recentFiles).toEqual(["/root/a.md", "/root/b.md"]);
    expect(c.window).toEqual({ width: 1000, height: 700, maximized: true });
    expect(c.autoSave).toBe(false);
    expect(c.autoSaveDelay).toBe(1500);
  });

  it("repairs a malformed window object", () => {
    const c = migrateConfig({ window: "big" });
    expect(c.window).toEqual(DEFAULT_CONFIG.window);
  });

  it("nulls a non-string lastFolder", () => {
    expect(migrateConfig({ lastFolder: 5 }).lastFolder).toBeNull();
  });
});

describe("migrateConfig — v2 -> v3 (iter2-ext fields)", () => {
  /** A realistic iter2 (configVersion 2) settings blob. */
  const V2_BLOB = {
    configVersion: 2,
    theme: "dark",
    fontFamily: "Fira Code",
    fontSize: 16,
    defaultView: "edit",
    workspaceLayout: "split",
    splitRatio: 0.4,
    paneViewModes: ["edit", "preview"],
    sidebarVisible: false,
    sidebarWidth: 300,
    lastFolder: "/root/notes",
    recentFiles: ["/root/a.md"],
    window: { width: 1000, height: 700, maximized: true },
    autoSave: false,
    autoSaveDelay: 1500,
  };

  it("stamps configVersion 3", () => {
    expect(CONFIG_VERSION).toBe(3);
    expect(migrateConfig(V2_BLOB).configVersion).toBe(3);
  });

  it("backfills every new field with its default", () => {
    const c = migrateConfig(V2_BLOB);
    expect(c.accent).toBe("sky");
    expect(c.accentCustom).toBeNull();
    expect(c.tocVisible).toBe(false);
    expect(c.tocPosition).toBe("right");
    expect(c.tocWidth).toBe(220);
  });

  it("leaves every iter2 field untouched while upgrading", () => {
    const c = migrateConfig(V2_BLOB);
    expect(c.theme).toBe("dark");
    expect(c.fontFamily).toBe("Fira Code");
    expect(c.fontSize).toBe(16);
    expect(c.defaultView).toBe("edit");
    expect(c.workspaceLayout).toBe("split");
    expect(c.splitRatio).toBeCloseTo(0.4, 5);
    expect(c.paneViewModes).toEqual(["edit", "preview"]);
    expect(c.sidebarVisible).toBe(false);
    expect(c.sidebarWidth).toBe(300);
    expect(c.lastFolder).toBe("/root/notes");
    expect(c.recentFiles).toEqual(["/root/a.md"]);
    expect(c.window).toEqual({ width: 1000, height: 700, maximized: true });
    expect(c.autoSave).toBe(false);
    expect(c.autoSaveDelay).toBe(1500);
  });

  it("defaults a fresh install to the historical sky accent (S-14)", () => {
    expect(migrateConfig(null).accent).toBe("sky");
    expect(DEFAULT_CONFIG.accent).toBe("sky");
  });
});

describe("migrateConfig — accent", () => {
  it("keeps each of the seven preset ids", () => {
    for (const id of ["sky", "blue", "green", "purple", "orange", "red", "pink"]) {
      expect(migrateConfig({ accent: id }).accent).toBe(id);
    }
  });

  it("keeps the reserved 'custom' id", () => {
    expect(migrateConfig({ accent: "custom" }).accent).toBe("custom");
  });

  it("falls back to sky for an unknown or non-string id", () => {
    expect(migrateConfig({ accent: "teal" }).accent).toBe("sky");
    expect(migrateConfig({ accent: 7 }).accent).toBe("sky");
    expect(migrateConfig({ accent: null }).accent).toBe("sky");
    expect(migrateConfig({ accent: { id: "sky" } }).accent).toBe("sky");
  });
});

describe("migrateConfig — accentCustom", () => {
  it("keeps a valid hex and normalises it to lower case", () => {
    expect(migrateConfig({ accentCustom: "#1A2B3C" }).accentCustom).toBe("#1a2b3c");
  });

  it("keeps a 3-digit shorthand", () => {
    expect(migrateConfig({ accentCustom: "#f0a" }).accentCustom).toBe("#f0a");
  });

  it("nulls a malformed or non-string value", () => {
    expect(migrateConfig({ accentCustom: "red" }).accentCustom).toBeNull();
    expect(migrateConfig({ accentCustom: "#12345" }).accentCustom).toBeNull();
    expect(migrateConfig({ accentCustom: 0x1a2b3c }).accentCustom).toBeNull();
    expect(migrateConfig({}).accentCustom).toBeNull();
  });
});

describe("migrateConfig — toc fields", () => {
  it("keeps a persisted tocVisible flag", () => {
    expect(migrateConfig({ tocVisible: true }).tocVisible).toBe(true);
    expect(migrateConfig({ tocVisible: false }).tocVisible).toBe(false);
  });

  it("falls back to false for a non-boolean tocVisible", () => {
    expect(migrateConfig({ tocVisible: "yes" }).tocVisible).toBe(false);
    expect(migrateConfig({}).tocVisible).toBe(false);
  });

  it("keeps both legal tocPosition values", () => {
    expect(migrateConfig({ tocPosition: "left" }).tocPosition).toBe("left");
    expect(migrateConfig({ tocPosition: "right" }).tocPosition).toBe("right");
  });

  it("falls back to right for an illegal tocPosition", () => {
    expect(migrateConfig({ tocPosition: "top" }).tocPosition).toBe("right");
    expect(migrateConfig({ tocPosition: 1 }).tocPosition).toBe("right");
  });

  it("clamps tocWidth into the [180, 480] band (S-12)", () => {
    expect(migrateConfig({ tocWidth: 10 }).tocWidth).toBe(180);
    expect(migrateConfig({ tocWidth: 9999 }).tocWidth).toBe(480);
    expect(migrateConfig({ tocWidth: 260 }).tocWidth).toBe(260);
  });

  it("rounds a fractional tocWidth and repairs a non-numeric one", () => {
    expect(migrateConfig({ tocWidth: 260.7 }).tocWidth).toBe(261);
    expect(migrateConfig({ tocWidth: "wide" }).tocWidth).toBe(220);
    expect(migrateConfig({ tocWidth: Number.NaN }).tocWidth).toBe(220);
  });

  it("does not persist sidebarMode — it is session-only state", () => {
    expect("sidebarMode" in migrateConfig({ sidebarMode: "toc" })).toBe(false);
  });
});

describe("migrateConfig — never throws", () => {
  it("survives a getter that explodes", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const hostile = {
      get theme(): string {
        throw new Error("boom");
      },
    };
    const c = migrateConfig(hostile);
    expect(c.theme).toBe("auto");
    expect(c.defaultView).toBe("live");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("survives deeply nested garbage", () => {
    expect(() =>
      migrateConfig({ window: { width: {}, height: [], maximized: "yes" } }),
    ).not.toThrow();
  });
});
