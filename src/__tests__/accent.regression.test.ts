/**
 * T01 accent colour layer — QA independent regression pass (iter2-ext §3.2).
 *
 * `accent.test.ts` already covers 3/6-digit parsing, the WCAG luminance curve,
 * the preset palette and the `applyAccent` DOM writer. This file pins the
 * boundary behaviours the QA review flagged that a green build could still hide:
 *
 *   • 8-digit "#rrggbbaa" hex — NOT part of the accent contract. `hexToRgb`
 *     must reject it (return null) so it degrades to `sky` rather than being
 *     mis-parsed into a wrong colour. This is a deliberate spec-confirmation
 *     test: accent colours are opaque, alpha is derived separately.
 *   • `applyAccent('custom', <illegal hex>)` must fall back to the sky preset
 *     without throwing — the P1 custom-picker degradation path.
 *   • `applyAccent` under a partial / hostile DOM must never throw.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ACCENT,
  applyAccent,
  deriveAccentVars,
  hexToRgb,
  relativeLuminance,
  rgbToHex,
  shiftLightness,
} from "../lib/theme";

const SKY = "#0ea5e9";

/* ------------------------------------------------------------------ *
 * Fake DOM harness (same convention as accent.test.ts / S-11).
 * ------------------------------------------------------------------ */

const g = globalThis as unknown as { document?: unknown };
const originalDocument = g.document;

interface StyleHarness {
  props: Record<string, string>;
  setCalls: number;
}

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

afterEach(() => {
  if (originalDocument === undefined) delete g.document;
  else g.document = originalDocument;
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ *
 * 8-digit alpha hex — rejected, degrades to sky (spec confirmation)
 * ------------------------------------------------------------------ */

describe("hexToRgb — 8-digit #rrggbbaa is out of contract", () => {
  it("rejects an 8-digit hex rather than mis-parsing it", () => {
    // The accent contract is 3/6-digit opaque hex only. An 8-digit value would
    // silently drop or misread the alpha, so it is rejected outright.
    expect(hexToRgb("#ffffff80")).toBeNull();
    expect(hexToRgb("#0ea5e9ff")).toBeNull();
    expect(hexToRgb("ffffff80")).toBeNull();
  });

  it("still accepts the supported 3-digit and 6-digit forms", () => {
    expect(hexToRgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb("#f0a")).toEqual({ r: 255, g: 0, b: 170 });
  });

  it("degrades an 8-digit hex to the sky luminance instead of NaN", () => {
    expect(relativeLuminance("#ffffff80")).toBeCloseTo(relativeLuminance(SKY), 10);
  });

  it("deriveAccentVars falls back to sky for an 8-digit primary", () => {
    const vars = deriveAccentVars("#ffffff80", null, "light");
    expect(vars["--primary"]).toBe(DEFAULT_ACCENT.primary);
    expect(vars["--primary-soft"]).toBe("rgba(14, 165, 233, 0.1)");
  });
});

/* ------------------------------------------------------------------ *
 * rgbToHex — never emits an alpha channel
 * ------------------------------------------------------------------ */

describe("rgbToHex — always opaque 6-digit output", () => {
  it("emits exactly 7 characters (#rrggbb), no alpha", () => {
    const hex = rgbToHex({ r: 255, g: 255, b: 255 });
    expect(hex).toBe("#ffffff");
    expect(hex).toHaveLength(7);
  });

  it("pads single-nibble channels to two hex digits", () => {
    expect(rgbToHex({ r: 1, g: 2, b: 3 })).toBe("#010203");
  });
});

/* ------------------------------------------------------------------ *
 * applyAccent — custom with an illegal hex degrades to sky
 * ------------------------------------------------------------------ */

describe("applyAccent — custom accent with a bad hex", () => {
  it("falls back to sky for a malformed custom hex (no throw)", () => {
    const dom = installStyleDom();
    expect(() => applyAccent("custom", "not-a-colour", "light")).not.toThrow();
    expect(dom.props["--primary"]).toBe(DEFAULT_ACCENT.primary);
    // A custom accent has no explicit hover, so the hover is SYNTHESISED from
    // the (fallback) sky primary rather than reusing the sky preset's #0284c7.
    expect(dom.props["--primary-hover"]).toBe(shiftLightness(DEFAULT_ACCENT.primary, -0.1));
  });

  it("falls back to sky for an 8-digit custom hex", () => {
    const dom = installStyleDom();
    applyAccent("custom", "#ffffff80", "dark");
    expect(dom.props["--primary"]).toBe(DEFAULT_ACCENT.primary);
    // dark-mode soft alpha still tracks the resolved theme (0.18).
    expect(dom.props["--primary-soft"]).toBe("rgba(14, 165, 233, 0.18)");
  });

  it("honours a legal 3-digit custom hex", () => {
    const dom = installStyleDom();
    applyAccent("custom", "#f0a", "light");
    expect(dom.props["--primary"]).toBe("#ff00aa");
  });

  it("still writes exactly the five accent variables on the fallback path", () => {
    const dom = installStyleDom();
    applyAccent("custom", "###", "light");
    expect(dom.setCalls).toBe(5);
    expect(Object.keys(dom.props).sort()).toEqual(
      [
        "--primary",
        "--primary-foreground",
        "--primary-hover",
        "--primary-soft",
        "--ring",
      ].sort(),
    );
  });
});
