/**
 * Unit tests for `src/lib/markdown.ts` — the `marked` GFM rendering pipeline.
 * Assertions target the semantic HTML that `src/lib/markdown.ts` produces,
 * not the exact string, so minor `marked` formatting changes do not break them.
 */
import { describe, expect, it } from "vitest";
import { render } from "../lib/markdown";

describe("render — headings", () => {
  it.each([
    ["# H1", "h1", "H1"],
    ["## H2", "h2", "H2"],
    ["### H3", "h3", "H3"],
    ["#### H4", "h4", "H4"],
  ])("renders %s as <%s>", (md, tag, text) => {
    const html = render(md);
    expect(html).toMatch(new RegExp(`<${tag}[^>]*>${text}</${tag}>`));
  });

  it("does not treat a hash without a space as a heading", () => {
    expect(render("#nospace")).not.toContain("<h1");
  });
});

describe("render — lists", () => {
  it("renders an unordered list", () => {
    const html = render("- a\n- b");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<li>b</li>");
  });

  it("renders an ordered list", () => {
    const html = render("1. a\n2. b");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>a</li>");
  });

  it("renders a GFM task list with checkboxes", () => {
    const html = render("- [ ] todo\n- [x] done");
    const checkboxes = html.match(/type="checkbox"/g) ?? [];
    expect(checkboxes).toHaveLength(2);
    expect(html).toContain("disabled");
    // exactly one of them is checked
    expect(html.match(/checked/g) ?? []).toHaveLength(1);
  });

  it("renders nested lists", () => {
    const html = render("- a\n  - b");
    expect((html.match(/<ul>/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("render — GFM inline features", () => {
  it("renders strikethrough as <del>", () => {
    expect(render("~~gone~~")).toContain("<del>gone</del>");
  });

  it("renders bold and italic", () => {
    expect(render("**b**")).toContain("<strong>b</strong>");
    expect(render("*i*")).toContain("<em>i</em>");
  });

  it("renders inline code", () => {
    expect(render("`x`")).toContain("<code>x</code>");
  });

  it("renders links", () => {
    expect(render("[t](https://example.com)")).toContain('href="https://example.com"');
  });

  it("renders images", () => {
    const html = render("![alt](img.png)");
    expect(html).toContain('src="img.png"');
    expect(html).toContain('alt="alt"');
  });
});

describe("render — blocks", () => {
  it("renders a blockquote", () => {
    const html = render("> quoted");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("quoted");
  });

  it("renders a fenced code block and keeps the language class", () => {
    const html = render("```js\nconst a = 1;\n```");
    expect(html).toContain("<pre>");
    expect(html).toMatch(/<code[^>]*class="[^"]*language-js/);
    expect(html).toContain("const a = 1;");
  });

  it("renders a fenced code block without a language", () => {
    const html = render("```\nplain\n```");
    expect(html).toContain("<pre>");
    expect(html).toContain("plain");
  });

  it("escapes HTML-significant characters inside code blocks", () => {
    const html = render("```\n<script>\n```");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders a horizontal rule", () => {
    expect(render("---\n")).toContain("<hr>");
  });
});

describe("render — GFM tables", () => {
  const md = "| A | B |\n| --- | --- |\n| 1 | 2 |";
  const html = render(md);

  it("produces a full table structure", () => {
    expect(html).toContain("<table>");
    expect(html).toContain("<thead>");
    expect(html).toContain("<tbody>");
  });

  it("maps the header row to <th> and the body row to <td>", () => {
    expect(html).toMatch(/<th[^>]*>A<\/th>/);
    expect(html).toMatch(/<th[^>]*>B<\/th>/);
    expect(html).toMatch(/<td[^>]*>1<\/td>/);
    expect(html).toMatch(/<td[^>]*>2<\/td>/);
  });

  it("honours column alignment markers", () => {
    const aligned = render("| L | C | R |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |");
    expect(aligned).toContain("center");
    expect(aligned).toContain("right");
  });

  it("renders the toolbar-generated table template", () => {
    const template =
      "| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n" +
      "| 单元格 | 单元格 | 单元格 |\n| 单元格 | 单元格 | 单元格 |";
    const out = render(template);
    expect(out).toContain("<table>");
    // `<th[ >]` so the `<thead>` open tag is not counted as a header cell.
    expect((out.match(/<th[ >]/g) ?? []).length).toBe(3);
    expect((out.match(/<tr[ >]/g) ?? []).length).toBe(3); // 1 head + 2 body
  });
});

describe("render — options and robustness", () => {
  it("does not convert single newlines to <br> (breaks: false)", () => {
    expect(render("a\nb")).not.toContain("<br>");
  });

  it("returns a string (not a Promise) — async: false", () => {
    const out = render("# sync");
    expect(typeof out).toBe("string");
  });

  it("renders an empty document as an empty string", () => {
    expect(render("")).toBe("");
  });

  it("does not throw on unusual input", () => {
    expect(() => render("| broken | table\n|---")).not.toThrow();
    expect(() => render("****")).not.toThrow();
    expect(() => render("[unclosed(")).not.toThrow();
  });

  it("passes through inline HTML (documented behaviour for <kbd> etc.)", () => {
    expect(render("Press <kbd>Ctrl</kbd>")).toContain("<kbd>Ctrl</kbd>");
  });
});
