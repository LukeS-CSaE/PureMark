/**
 * T03 — TOC data layer (iter2-ext N-07).
 *
 * Covers the parseToc state machine (fence skipping, levels, 1-based line
 * numbers, 0-based index, inline-text cleaning, id/slug de-duplication) and
 * slugify. The critical invariant — parseToc and `marked` agree on which `#`
 * are headings — is locked by a back-to-back count comparison (shared
 * knowledge S-10): both skip fenced code blocks, so the heading sequences must
 * match.
 */
import { describe, expect, it } from "vitest";
import { marked } from "marked";
import { parseToc, slugify } from "../lib/toc";

describe("parseToc — headings", () => {
  it("extracts multi-level headings in document order", () => {
    const md = ["# A", "", "## B", "", "### C", "", "text", "", "# A2"].join("\n");
    const items = parseToc(md);
    expect(items.map((i) => i.level)).toEqual([1, 2, 3, 1]);
    expect(items.map((i) => i.text)).toEqual(["A", "B", "C", "A2"]);
    expect(items.map((i) => i.index)).toEqual([0, 1, 2, 3]);
  });

  it("records 1-based line numbers and 0-based index", () => {
    const md = ["# A", "", "## B", "", "### C", "", "text", "", "# A2"].join("\n");
    const items = parseToc(md);
    expect(items[0].line).toBe(1);
    expect(items[1].line).toBe(3);
    expect(items[2].line).toBe(5);
    expect(items[3].line).toBe(9);
    expect(items[0].index).toBe(0);
    expect(items[3].index).toBe(3);
  });

  it("returns [] for no headings / empty input", () => {
    expect(parseToc("")).toEqual([]);
    expect(parseToc("just text\nmore text")).toEqual([]);
    expect(parseToc("a paragraph with # not a heading")).toEqual([]);
  });

  it("ignores a `#` inside a ``` fenced code block", () => {
    const md = ["# Real", "", "```", "# ignored", "more # text", "```", "", "## Also Real"].join("\n");
    const items = parseToc(md);
    expect(items.map((i) => i.text)).toEqual(["Real", "Also Real"]);
  });

  it("ignores a `#` inside a ~~~ fenced code block", () => {
    const md = ["# Top", "", "~~~", "# inside tilde", "~~~", "", "## Bottom"].join("\n");
    const items = parseToc(md);
    expect(items.map((i) => i.text)).toEqual(["Top", "Bottom"]);
  });

  it("a shorter closing fence does NOT close a longer opening fence", () => {
    // Opening is `~~~~` (4 tildes); the `~~~` (3) line must not close it, so
    // both inner `#` lines stay hidden.
    const md = ["# A", "", "~~~~", "# hidden-1", "~~~", "# hidden-2", "~~~~", "", "## B"].join("\n");
    const items = parseToc(md);
    expect(items.map((i) => i.text)).toEqual(["A", "B"]);
  });

  it("a 4-space indented `#` is a code block, not a heading", () => {
    const md = ["# A", "    # indented (code block)", "## B"].join("\n");
    const items = parseToc(md);
    expect(items.map((i) => i.text)).toEqual(["A", "B"]);
  });

  it("strips trailing closing hashes and cleans inline markup", () => {
    const items = parseToc("## **Bold** and [link](http://x.com) ###");
    expect(items[0].text).toBe("Bold and link");
    expect(items[0].level).toBe(2);
  });

  it("builds stable ids and de-duplicates by slug", () => {
    const items = parseToc("# A\n\n# B\n\n# A\n\n# A");
    expect(items.map((i) => i.id)).toEqual(["a", "b", "a-1", "a-2"]);
  });

  it("falls back to heading-{index} for empty-text headings", () => {
    const items = parseToc("# \n\n## ");
    expect(items[0].text).toBe("");
    expect(items[0].id).toBe("heading-0");
    expect(items[1].text).toBe("");
    expect(items[1].id).toBe("heading-1");
  });

  it("treats `###Word` (no space) as NOT a heading (CommonMark)", () => {
    const items = parseToc("###Word\n\n# Real");
    expect(items.map((i) => i.text)).toEqual(["Real"]);
  });
});

describe("slugify", () => {
  it("lowercases and replaces whitespace with dashes", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("  Multiple   Spaces  ")).toBe("multiple-spaces");
  });

  it("strips punctuation but keeps letters, digits and CJK", () => {
    expect(slugify("C++ & Rust")).toBe("c-rust");
    expect(slugify("第二章 快捷键")).toBe("第二章-快捷键");
  });

  it("collapses repeated dashes and trims edge dashes", () => {
    expect(slugify("  -- wei rd -- ")).toBe("wei-rd");
  });
});

describe("parseToc vs marked — same heading set (fences skipped on both)", () => {
  it("matches marked's rendered <h*> count for a fenced document", () => {
    const md = [
      "# Title",
      "",
      "Some intro text with # not a heading.",
      "",
      "```js",
      "// a comment with # inside code",
      "function f() { return 1; }",
      "```",
      "",
      "## Section A",
      "",
      "~~~",
      "# also hidden in a tilde fence",
      "~~~",
      "",
      "### Subsection",
      "",
      "#### Deep",
    ].join("\n");

    const items = parseToc(md);
    const html = String(marked.parse(md));
    const markedHeadings = (html.match(/<h[1-6](\s|>)/g) ?? []).length;

    expect(items.length).toBe(markedHeadings);
    expect(items.map((i) => i.text)).toEqual([
      "Title",
      "Section A",
      "Subsection",
      "Deep",
    ]);
  });
});
