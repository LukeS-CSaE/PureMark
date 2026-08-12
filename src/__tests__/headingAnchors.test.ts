/**
 * Unit tests for the heading-anchor module (iter2-ext T05 / N-07).
 *
 * The pure helpers (`slugifyHeading`, `dedupeSlugs`, `applyAnchors`,
 * `findHeadingEl`) are tested directly with mock elements. The two DOM-wiring
 * functions (`attachHeadingAnchors`, `findHeadingEl`) accept a root with
 * `querySelectorAll` so we can stub a tiny fake DOM without spinning up jsdom.
 */
import { describe, expect, it, vi } from "vitest";
import {
  slugifyHeading,
  dedupeSlugs,
  applyAnchors,
  attachHeadingAnchors,
  findHeadingEl,
} from "../lib/headingAnchors";

describe("slugifyHeading", () => {
  it("lowercases and replaces whitespace with dashes", () => {
    expect(slugifyHeading("Hello World")).toBe("hello-world");
  });

  it("collapses repeated whitespace and trims", () => {
    expect(slugifyHeading("  A  B  ")).toBe("a-b");
  });

  it("keeps CJK characters (non-empty result, no throw)", () => {
    const s = slugifyHeading("你好 世界");
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(0);
    // At least one CJK ideograph survives.
    expect(s).toMatch(/[\u4e00-\u9fff]/);
  });

  it("strips characters that are not letters, digits or dashes", () => {
    expect(slugifyHeading("Foo! Bar? #baz")).toBe("foo-bar-baz");
  });
});

describe("dedupeSlugs", () => {
  it("assigns the base slug to unique headings", () => {
    const out = dedupeSlugs([
      { text: "Hello", line: 1, index: 0 },
      { text: "World", line: 2, index: 1 },
    ]);
    expect(out[0]?.id).toBe("hello");
    expect(out[1]?.id).toBe("world");
  });

  it("suffixes duplicates with -1, -2, … (matching parseToc's seen map)", () => {
    const out = dedupeSlugs([
      { text: "Same", line: 1, index: 0 },
      { text: "Same", line: 2, index: 1 },
      { text: "Same", line: 3, index: 2 },
    ]);
    expect(out.map((o) => o.id)).toEqual(["same", "same-1", "same-2"]);
  });

  it("falls back to heading-{index} for empty text", () => {
    const out = dedupeSlugs([
      { text: "", line: 1, index: 0 },
      { text: "", line: 2, index: 1 },
    ]);
    expect(out[0]?.id).toBe("heading-0");
    expect(out[1]?.id).toBe("heading-1");
  });

  it("preserves line and index alongside the assigned id", () => {
    const out = dedupeSlugs([{ text: "Intro", line: 7, index: 3 }]);
    expect(out[0]).toEqual({ id: "intro", text: "Intro", line: 7, index: 3 });
  });
});

describe("applyAnchors", () => {
  function mockHeading(): HTMLElement {
    return { id: "" } as HTMLElement;
  }

  it("sets each heading's id from the matching item", () => {
    const headings = [mockHeading(), mockHeading()];
    applyAnchors(headings, [{ id: "a" }, { id: "b" }]);
    expect(headings[0]?.id).toBe("a");
    expect(headings[1]?.id).toBe("b");
  });

  it("warns but does not throw when counts mismatch", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const headings = [mockHeading()];
    applyAnchors(headings, [{ id: "a" }, { id: "b" }]);
    expect(warn).toHaveBeenCalledOnce();
    expect(headings[0]?.id).toBe("a");
    warn.mockRestore();
  });

  it("is a no-op when both arrays are empty", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    applyAnchors([], []);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("attachHeadingAnchors / findHeadingEl (querySelectorAll stub)", () => {
  function mockRoot(headings: HTMLElement[]): HTMLElement {
    return {
      querySelectorAll(sel: string): NodeListOf<HTMLElement> {
        if (!/^h[1-6](, ?h[1-6])*$/.test(sel)) {
          return [] as unknown as NodeListOf<HTMLElement>;
        }
        return headings as unknown as NodeListOf<HTMLElement>;
      },
    } as unknown as HTMLElement;
  }

  it("attachHeadingAnchors calls applyAnchors with the queried headings", () => {
    const headings = [{ id: "" }, { id: "" }] as HTMLElement[];
    const root = mockRoot(headings);
    attachHeadingAnchors(root, [{ id: "x" }, { id: "y" }]);
    expect(headings[0]?.id).toBe("x");
    expect(headings[1]?.id).toBe("y");
  });

  it("findHeadingEl returns the heading whose id matches", () => {
    const headings = [
      { id: "intro" },
      { id: "body" },
    ] as unknown as HTMLElement[];
    const root = mockRoot(headings);
    expect(findHeadingEl(root, "body")?.id).toBe("body");
    expect(findHeadingEl(root, "intro")?.id).toBe("intro");
  });

  it("findHeadingEl returns null when no heading has the requested id", () => {
    const headings = [{ id: "intro" }] as unknown as HTMLElement[];
    const root = mockRoot(headings);
    expect(findHeadingEl(root, "missing")).toBeNull();
  });
});