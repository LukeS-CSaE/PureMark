/**
 * T01 independent boundary tests for the accent layer (`src/lib/theme.ts`).
 *
 * ADDITIVE to the engineer's `accent.test.ts` — these pin down the edges the
 * first pass did not lock: the full per-preset `deriveAccentVars` contract for
 * all seven colours, the fall-back behaviour for malformed / custom hex (incl.
 * 3-digit shorthand and 8-digit alpha, which behave differently), and the
 * missing/broken `document` guards that make `applyAccent` a safe no-op under
 * SSR / node.
 *
 * Runs in the `node` environment; a minimal fake `document.documentElement.style`
 * is installed by hand only where the DOM side-effect of `applyAccent` is
 * observed (same convention as `accent.test.ts`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  applyAccent,
  deriveAccentVars,
  hexToRgb,
} from "../lib/theme";
import type { AccentVarName } from "../lib/theme";

const SKY = DEFAULT_ACCENT.primary; // "#0ea5e9"

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
 * Per-preset deriveAccentVars contract — all seven colours
 * ------------------------------------------------------------------ */

describe("deriveAccentVars — per-preset contract (all 7 presets)", () => {
  it("locks --primary / --primary-hover / --primary-soft / --ring / --primary-foreground", () => {
    for (const p of ACCENT_PRESETS) {
      const { r, g: gg, b } = hexToRgb(p.primary)!;

      const light = deriveAccentVars(p.primary, p.hover, "light");
      expect(light["--primary"]).toBe(p.primary);
      expect(light["--primary-hover"]).toBe(p.hover);
      expect(light["--primary-soft"]).toBe(`rgba(${r}, ${gg}, ${b}, 0.1)`);
      expect(light["--ring"]).toBe(`rgba(${r}, ${gg}, ${b}, 0.35)`);
      expect(light["--primary-foreground"]).toBe("#ffffff");

      const dark = deriveAccentVars(p.primary, p.hover, "dark");
      expect(dark["--primary"]).toBe(p.primary);
      expect(dark["--primary-foreground"]).toBe("#ffffff");
      // --primary-soft tracks the resolved theme (0.18 in dark).
      expect(dark["--primary-soft"]).toBe(`rgba(${r}, ${gg}, ${b}, 0.18)`);
      // --ring is theme-independent.
      expect(dark["--ring"]).toBe(`rgba(${r}, ${gg}, ${b}, 0.35)`);
    }
  });

  it("emits exactly the five accent variables for every preset (S-1)", () => {
    const keys: AccentVarName[] = [
      "--primary",
      "--primary-hover",
      "--primary-soft",
      "--ring",
      "--primary-foreground",
    ];
    for (const p of ACCENT_PRESETS) {
      const vars = deriveAccentVars(p.primary, p.hover, "light");
      expect(Object.keys(vars).sort()).toEqual([...keys].sort());
    }
  });
});

/* ------------------------------------------------------------------ *
 * Malformed / custom hex — fall-back behaviour
 * ------------------------------------------------------------------ */

describe("deriveAccentVars — malformed / custom hex fall back to sky", () => {
  it("falls back to sky for a non-hex string like '#zzz'", () => {
    const v = deriveAccentVars("#zzz", null, "light");
    expect(v["--primary"]).toBe(SKY);
    expect(v["--primary-soft"]).toBe("rgba(14, 165, 233, 0.1)");
  });

  it("falls back to sky for an arbitrary non-hex string", () => {
    expect(deriveAccentVars("not-a-color", null, "light")["--primary"]).toBe(SKY);
  });

  it("falls back to sky for an 8-digit alpha hex (out of range for the 3|6 regex)", () => {
    expect(deriveAccentVars("#0ea5e9cc", null, "light")["--primary"]).toBe(SKY);
  });

  it("EXPANDS a valid 3-digit shorthand instead of falling back", () => {
    // #0a5 is a legal 3-digit hex -> expands to #00aa55; it must NOT degrade
    // to the default sky. This is the easy-to-miss boundary.
    const v = deriveAccentVars("#0a5", null, "light");
    expect(v["--primary"]).toBe("#00aa55");
    expect(v["--primary-soft"]).toBe("rgba(0, 170, 85, 0.1)");
  });
});

describe("applyAccent — malformed / custom hex fall back to sky", () => {
  it("uses a valid 3-digit custom hex (expanded), not the sky default", () => {
    const dom = installStyleDom();
    applyAccent("custom", "#0a5", "light");
    expect(dom.props["--primary"]).toBe("#00aa55");
  });

  it("falls back to sky when the custom hex is an 8-digit alpha", () => {
    const dom = installStyleDom();
    applyAccent("custom", "#0ea5e9cc", "light");
    expect(dom.props["--primary"]).toBe(SKY);
  });

  it("falls back to sky for a non-hex custom value", () => {
    const dom = installStyleDom();
    applyAccent("custom", "not-a-color", "light");
    expect(dom.props["--primary"]).toBe(SKY);
  });

  it("falls back to sky for an out-of-range custom hex like '#zzz'", () => {
    const dom = installStyleDom();
    applyAccent("custom", "#zzz", "light");
    expect(dom.props["--primary"]).toBe(SKY);
  });
});

/* ------------------------------------------------------------------ *
 * applyAccent — missing / broken document is a safe no-op (SSR / node)
 * ------------------------------------------------------------------ */

describe("applyAccent — missing / broken document is a safe no-op", () => {
  it("does nothing and does not throw when document is undefined (SSR/node)", () => {
    removeDom();
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
    expect(() => applyAccent("sky", null, "light")).not.toThrow();
  });

  it("returns early without throwing when documentElement is missing entirely", () => {
    g.document = {} as unknown; // documentElement absent
    expect(() => applyAccent("sky", null, "light")).not.toThrow();
  });

  it("returns early without throwing when style has no setProperty function", () => {
    g.document = {
      documentElement: { dataset: {}, style: {} },
    } as unknown;
    expect(() => applyAccent("sky", null, "light")).not.toThrow();
  });

  it("never throws across a battery of garbage inputs (defensive no-op)", () => {
    removeDom();
    const inputs: [unknown, string | null, "light" | "dark"][] = [
      ["sky", null, "light"],
      ["custom", "#zzz", "dark"],
      ["teal", "#0ea5e9cc", "light"],
      [null, "not-a-color", "dark"],
      [42, "#0a5", "light"],
    ];
    for (const [accent, custom, resolved] of inputs) {
      expect(() =>
        applyAccent(accent as never, custom as never, resolved),
      ).not.toThrow();
    }
  });
});
