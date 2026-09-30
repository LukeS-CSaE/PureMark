/**
 * Unit tests for the iter2-ext accent colour layer (`src/lib/theme.ts`,
 * design §3.2 / N-01 / N-02).
 *
 * The suite runs in the `node` environment, so — following the convention
 * already used by `theme.test.ts` (shared knowledge S-11) — a minimal fake
 * `document.documentElement.style` is installed by hand when the DOM
 * side-effect of `applyAccent` needs to be observed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  applyAccent,
  deriveAccentVars,
  getAccentPreset,
  hexToRgb,
  isAccentId,
  relativeLuminance,
  rgbToHex,
  shiftLightness,
} from "../lib/theme";
import type { AccentVarName } from "../lib/theme";

const SKY = "#0ea5e9";

/* ------------------------------------------------------------------ *
 * Fake DOM harness
 * ------------------------------------------------------------------ */

const g = globalThis as unknown as { document?: unknown };
const originalDocument = g.document;

interface StyleHarness {
  props: Record<string, string>;
  setCalls: number;
}

/** Install a `document` exposing only what `applyAccent` legitimately needs. */
function installStyleDom(): StyleHarness {
  const harness: StyleHarness = { props: {}, setCalls: 0 };
  g.document = {
    documentElement: {
      dataset: {} as Record<string, string>,
      style: {
        setProperty(name: string, value: string) {
          harness.props[name] = value;
          harness.setCalls += 1;
        },
      },
    },
  };
  return harness;
}

function removeDom(): void {
  delete g.document;
}

afterEach(() => {
  if (originalDocument === undefined) delete g.document;
  else g.document = originalDocument;
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ *
 * hexToRgb / rgbToHex
 * ------------------------------------------------------------------ */

describe("hexToRgb", () => {
  it("parses a 6-digit hex", () => {
    expect(hexToRgb(SKY)).toEqual({ r: 14, g: 165, b: 233 });
  });

  it("parses a 3-digit shorthand by doubling each nibble", () => {
    expect(hexToRgb("#f0a")).toEqual({ r: 255, g: 0, b: 170 });
  });

  it("is case-insensitive and tolerates surrounding whitespace", () => {
    expect(hexToRgb("  #0EA5E9 ")).toEqual({ r: 14, g: 165, b: 233 });
  });

  it("accepts a missing leading hash", () => {
    expect(hexToRgb("0ea5e9")).toEqual({ r: 14, g: 165, b: 233 });
  });

  it("rejects malformed input", () => {
    expect(hexToRgb("")).toBeNull();
    expect(hexToRgb("#12345")).toBeNull();
    expect(hexToRgb("#gggggg")).toBeNull();
    expect(hexToRgb("rgb(1,2,3)")).toBeNull();
    expect(hexToRgb(undefined as unknown as string)).toBeNull();
  });
});

describe("rgbToHex", () => {
  it("round-trips through hexToRgb", () => {
    for (const p of ACCENT_PRESETS) {
      expect(rgbToHex(hexToRgb(p.primary)!)).toBe(p.primary);
    }
  });

  it("clamps and rounds out-of-range channels", () => {
    expect(rgbToHex({ r: -20, g: 300, b: 127.6 })).toBe("#00ff80");
  });
});

/* ------------------------------------------------------------------ *
 * relativeLuminance
 * ------------------------------------------------------------------ */

describe("relativeLuminance", () => {
  it("returns 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 6);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 6);
  });

  it("matches the WCAG value for the sky preset", () => {
    expect(relativeLuminance(SKY)).toBeCloseTo(0.329, 2);
  });

  it("keeps every shipped preset below the 0.6 pivot (design §3.2 table)", () => {
    for (const p of ACCENT_PRESETS) {
      expect(relativeLuminance(p.primary)).toBeLessThan(0.6);
    }
  });

  it("degrades an illegal hex to the sky luminance instead of NaN", () => {
    expect(relativeLuminance("not-a-colour")).toBeCloseTo(relativeLuminance(SKY), 10);
  });
});

/* ------------------------------------------------------------------ *
 * shiftLightness
 * ------------------------------------------------------------------ */

describe("shiftLightness", () => {
  it("darkens when the delta is negative", () => {
    const darker = shiftLightness(SKY, -0.1);
    expect(relativeLuminance(darker)).toBeLessThan(relativeLuminance(SKY));
  });

  it("lightens when the delta is positive", () => {
    const lighter = shiftLightness(SKY, 0.1);
    expect(relativeLuminance(lighter)).toBeGreaterThan(relativeLuminance(SKY));
  });

  it("preserves the hue family (blue channel stays dominant for sky)", () => {
    const rgb = hexToRgb(shiftLightness(SKY, -0.1))!;
    expect(rgb.b).toBeGreaterThan(rgb.g);
    expect(rgb.g).toBeGreaterThan(rgb.r);
  });

  it("saturates at pure black / white instead of overflowing", () => {
    expect(shiftLightness(SKY, -1)).toBe("#000000");
    expect(shiftLightness(SKY, 1)).toBe("#ffffff");
  });

  it("handles achromatic input", () => {
    expect(shiftLightness("#808080", 0)).toBe("#808080");
  });

  it("falls back to sky for an illegal hex and to no-shift for a bad delta", () => {
    expect(shiftLightness("nope", -0.1)).toBe(DEFAULT_ACCENT.primary);
    expect(shiftLightness(SKY, Number.NaN)).toBe(SKY);
  });
});

/* ------------------------------------------------------------------ *
 * deriveAccentVars — the core pure derivation
 * ------------------------------------------------------------------ */

describe("deriveAccentVars — sky in light mode", () => {
  const vars = deriveAccentVars(SKY, "#0284c7", "light");

  it("passes the primary through verbatim", () => {
    expect(vars["--primary"]).toBe("#0ea5e9");
  });

  it("uses the explicit hover when one is supplied", () => {
    expect(vars["--primary-hover"]).toBe("#0284c7");
  });

  it("uses a 0.10 alpha for --primary-soft", () => {
    expect(vars["--primary-soft"]).toBe("rgba(14, 165, 233, 0.1)");
  });

  it("uses a 0.35 alpha for --ring", () => {
    expect(vars["--ring"]).toBe("rgba(14, 165, 233, 0.35)");
  });

  it("picks white as the foreground (luminance 0.33 < 0.6)", () => {
    expect(vars["--primary-foreground"]).toBe("#ffffff");
  });

  it("emits exactly the five accent variables and nothing else (S-1)", () => {
    const expected: AccentVarName[] = [
      "--primary",
      "--primary-hover",
      "--primary-soft",
      "--ring",
      "--primary-foreground",
    ];
    expect(Object.keys(vars).sort()).toEqual([...expected].sort());
  });
});

describe("deriveAccentVars — alpha tracks the resolved theme", () => {
  it("raises --primary-soft to 0.18 in dark mode", () => {
    expect(deriveAccentVars(SKY, "#0284c7", "dark")["--primary-soft"]).toBe(
      "rgba(14, 165, 233, 0.18)",
    );
  });

  it("keeps --ring's alpha theme-independent", () => {
    const light = deriveAccentVars(SKY, null, "light")["--ring"];
    const dark = deriveAccentVars(SKY, null, "dark")["--ring"];
    expect(light).toBe(dark);
  });

  it("keeps --primary and --primary-foreground theme-independent", () => {
    const light = deriveAccentVars(SKY, "#0284c7", "light");
    const dark = deriveAccentVars(SKY, "#0284c7", "dark");
    expect(dark["--primary"]).toBe(light["--primary"]);
    expect(dark["--primary-foreground"]).toBe(light["--primary-foreground"]);
  });
});

describe("deriveAccentVars — synthesised hover (custom accents, hover = null)", () => {
  it("darkens the hover in light mode", () => {
    const v = deriveAccentVars(SKY, null, "light");
    expect(relativeLuminance(v["--primary-hover"])).toBeLessThan(relativeLuminance(SKY));
  });

  it("lightens the hover in dark mode", () => {
    const v = deriveAccentVars(SKY, null, "dark");
    expect(relativeLuminance(v["--primary-hover"])).toBeGreaterThan(
      relativeLuminance(SKY),
    );
  });

  it("also synthesises when the supplied hover is itself malformed", () => {
    const v = deriveAccentVars(SKY, "#zzz", "light");
    expect(v["--primary-hover"]).toBe(shiftLightness(SKY, -0.1));
  });
});

describe("deriveAccentVars — foreground contrast pivot", () => {
  it("switches to the dark foreground for a bright accent", () => {
    // #fde047 (yellow-300) has a WCAG luminance of ~0.75 > 0.6.
    expect(deriveAccentVars("#fde047", null, "light")["--primary-foreground"]).toBe(
      "#1f2328",
    );
  });

  it("keeps white for a mid-tone accent", () => {
    expect(deriveAccentVars("#8b5cf6", null, "light")["--primary-foreground"]).toBe(
      "#ffffff",
    );
  });
});

describe("deriveAccentVars — illegal input falls back to sky", () => {
  it.each(["", "  ", "#12345", "rgb(0,0,0)", "transparent"])(
    "falls back for %j",
    (bad) => {
      const v = deriveAccentVars(bad, null, "light");
      expect(v["--primary"]).toBe(DEFAULT_ACCENT.primary);
      expect(v["--primary-soft"]).toBe("rgba(14, 165, 233, 0.1)");
    },
  );

  it("normalises an upper-case hex to lower case", () => {
    expect(deriveAccentVars("#0EA5E9", null, "light")["--primary"]).toBe("#0ea5e9");
  });

  it("expands a 3-digit shorthand", () => {
    expect(deriveAccentVars("#f0a", null, "light")["--primary"]).toBe("#ff00aa");
  });
});

/* ------------------------------------------------------------------ *
 * Preset palette snapshot
 * ------------------------------------------------------------------ */

describe("ACCENT_PRESETS", () => {
  it("ships the documented presets in order (design §3.2 + azure)", () => {
    expect(ACCENT_PRESETS.map((p) => p.id)).toEqual([
      "azure",
      "sky",
      "blue",
      "green",
      "purple",
      "orange",
      "red",
      "pink",
    ]);
  });

  it("matches the documented hex snapshot", () => {
    expect(ACCENT_PRESETS.map((p) => [p.id, p.primary, p.hover])).toEqual([
      ["azure", "#0071e3", "#0066cc"],
      ["sky", "#0ea5e9", "#0284c7"],
      ["blue", "#3b82f6", "#2563eb"],
      ["green", "#10b981", "#059669"],
      ["purple", "#8b5cf6", "#7c3aed"],
      ["orange", "#f97316", "#ea580c"],
      ["red", "#ef4444", "#dc2626"],
      ["pink", "#ec4899", "#db2777"],
    ]);
  });

  it("defaults to sky, i.e. the exact pre-iter2-ext colours", () => {
    expect(DEFAULT_ACCENT.id).toBe("sky");
    expect(DEFAULT_ACCENT.primary).toBe("#0ea5e9");
    expect(DEFAULT_ACCENT.hover).toBe("#0284c7");
  });

  it("every preset hover is darker than its primary", () => {
    for (const p of ACCENT_PRESETS) {
      expect(relativeLuminance(p.hover)).toBeLessThan(relativeLuminance(p.primary));
    }
  });

  it("every preset resolves to a white foreground", () => {
    for (const p of ACCENT_PRESETS) {
      expect(deriveAccentVars(p.primary, p.hover, "light")["--primary-foreground"]).toBe(
        "#ffffff",
      );
    }
  });
});

describe("isAccentId / getAccentPreset", () => {
  it("accepts the seven preset ids plus 'custom'", () => {
    for (const p of ACCENT_PRESETS) expect(isAccentId(p.id)).toBe(true);
    expect(isAccentId("custom")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isAccentId("teal")).toBe(false);
    expect(isAccentId(3)).toBe(false);
    expect(isAccentId(null)).toBe(false);
    expect(isAccentId(undefined)).toBe(false);
  });

  it("resolves preset ids and returns null for 'custom'", () => {
    expect(getAccentPreset("purple")?.primary).toBe("#8b5cf6");
    expect(getAccentPreset("custom")).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * applyAccent — the only DOM writer
 * ------------------------------------------------------------------ */

describe("applyAccent", () => {
  it("writes the five variables as inline custom properties", () => {
    const dom = installStyleDom();
    applyAccent("sky", null, "light");

    expect(dom.setCalls).toBe(5);
    expect(dom.props).toEqual({
      "--primary": "#0ea5e9",
      "--primary-hover": "#0284c7",
      "--primary-soft": "rgba(14, 165, 233, 0.1)",
      "--ring": "rgba(14, 165, 233, 0.35)",
      "--primary-foreground": "#ffffff",
    });
  });

  it("applies the chosen preset rather than the default", () => {
    const dom = installStyleDom();
    applyAccent("purple", null, "light");
    expect(dom.props["--primary"]).toBe("#8b5cf6");
    expect(dom.props["--primary-hover"]).toBe("#7c3aed");
  });

  it("re-derives --primary-soft when the resolved theme flips", () => {
    const dom = installStyleDom();
    applyAccent("sky", null, "light");
    expect(dom.props["--primary-soft"]).toBe("rgba(14, 165, 233, 0.1)");
    applyAccent("sky", null, "dark");
    expect(dom.props["--primary-soft"]).toBe("rgba(14, 165, 233, 0.18)");
  });

  it("never touches data-theme — applyTheme keeps that privilege (S-2)", () => {
    installStyleDom();
    applyAccent("red", null, "dark");
    const doc = g.document as { documentElement: { dataset: Record<string, string> } };
    expect(doc.documentElement.dataset.theme).toBeUndefined();
  });

  it("honours a custom hex when accent is 'custom'", () => {
    const dom = installStyleDom();
    applyAccent("custom", "#123456", "light");
    expect(dom.props["--primary"]).toBe("#123456");
  });

  it("falls back to sky when accent is 'custom' but no hex is stored", () => {
    const dom = installStyleDom();
    applyAccent("custom", null, "light");
    expect(dom.props["--primary"]).toBe("#0ea5e9");
  });

  it("falls back to sky for an unknown accent id", () => {
    const dom = installStyleDom();
    applyAccent("teal" as never, null, "light");
    expect(dom.props["--primary"]).toBe("#0ea5e9");
  });

  it("is a silent no-op without a document", () => {
    removeDom();
    expect(() => applyAccent("sky", null, "light")).not.toThrow();
  });

  it("is a silent no-op when documentElement has no style object", () => {
    g.document = { documentElement: { dataset: {} } };
    expect(() => applyAccent("sky", null, "light")).not.toThrow();
  });

  it("swallows a throwing setProperty and warns instead of breaking render", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    g.document = {
      documentElement: {
        dataset: {},
        style: {
          setProperty() {
            throw new Error("CSSOM exploded");
          },
        },
      },
    };
    expect(() => applyAccent("sky", null, "light")).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
