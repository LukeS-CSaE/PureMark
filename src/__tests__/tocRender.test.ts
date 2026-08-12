/**
 * Render smoke tests for the TOC UI (iter2-ext T04).
 *
 * Same SSR approach as `editorCardRender.test.ts`: `react-dom/server`'s
 * `renderToStaticMarkup` asserts structure without jsdom (which QA may not
 * install). Effects never run under SSR, so `useToc`'s debounced parse does
 * not execute — `TocPanel` therefore stubs `useToc` and we assert the
 * *visibility gate* + head + empty state, while `TocList` is exercised
 * directly with concrete data.
 *
 * JSX is avoided (`createElement`) so the file stays a `.test.ts` and is picked
 * up by the existing vitest `include` glob (under `src` and matching the
 * `.test.ts` suffix) — no vitest config change needed.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TocItem } from "../types";

const TocList = (await import("../components/Toc/TocList")).default;

vi.mock("../hooks/useToc", () => {
  const useTocMock = vi.fn(() => ({
    items: [] as TocItem[],
    jump: () => {},
    visible: false,
    position: "right" as const,
  }));
  return { useToc: useTocMock };
});

const { useToc } = await import("../hooks/useToc");
const TocPanel = (await import("../components/Toc/TocPanel")).default;

const count = (html: string, needle: string): number => html.split(needle).length - 1;

function makeItem(id: string, level: number, text: string): TocItem {
  return { id, level, text, line: 1, index: 0 };
}

describe("TocList", () => {
  it("renders each heading with its text and an indent scaled by level", () => {
    const items: TocItem[] = [
      makeItem("a", 1, "Title"),
      makeItem("b", 2, "Section"),
      makeItem("c", 3, "Sub"),
    ];
    const html = renderToStaticMarkup(createElement(TocList, { items, onJump: () => {} }));
    expect(count(html, "toc-item")).toBe(3);
    expect(html).toContain("Title");
    expect(html).toContain("Section");
    expect(html).toContain("Sub");
    // h3 (level 3) sits two levels deeper than h1 -> larger left padding.
    expect(html).toMatch(/padding-left:\s*10px/);
    expect(html).toMatch(/padding-left:\s*38px/);
  });

  it('shows the "本文档暂无标题" hint when there are no headings', () => {
    const html = renderToStaticMarkup(createElement(TocList, { items: [], onJump: () => {} }));
    expect(html).toContain("本文档暂无标题");
    expect(count(html, "toc-item")).toBe(0);
  });

  it("renders a clickable link per heading (handler wired through onJump)", () => {
    const item = makeItem("a", 1, "Title");
    const html = renderToStaticMarkup(createElement(TocList, { items: [item], onJump: () => {} }));
    expect(html).toContain('class="toc-link"');
  });
});

describe("TocPanel", () => {
  it("renders nothing when the outline is hidden (visibility gate)", () => {
    vi.mocked(useToc).mockReturnValue({ items: [], jump: () => {}, visible: false, position: "right" });
    const html = renderToStaticMarkup(createElement(TocPanel));
    expect(html).toBe("");
  });

  it("renders the head + empty state when visible but the document has no headings", () => {
    vi.mocked(useToc).mockReturnValue({ items: [], jump: () => {}, visible: true, position: "right" });
    const html = renderToStaticMarkup(createElement(TocPanel));
    expect(html).toContain("toc-panel");
    expect(html).toContain("目录");
    expect(html).toContain("本文档暂无标题");
  });

  it("renders the heading list when visible with items", () => {
    const items: TocItem[] = [makeItem("a", 1, "Intro"), makeItem("b", 2, "Body")];
    vi.mocked(useToc).mockReturnValue({ items, jump: () => {}, visible: true, position: "right" });
    const html = renderToStaticMarkup(createElement(TocPanel));
    expect(count(html, "toc-item")).toBe(2);
    expect(html).toContain("Intro");
    expect(html).toContain("Body");
  });

  it("forwards the jump callback straight to TocList", () => {
    const jump = vi.fn();
    const items: TocItem[] = [makeItem("a", 1, "Intro")];
    vi.mocked(useToc).mockReturnValue({ items, jump, visible: true, position: "right" });
    const html = renderToStaticMarkup(createElement(TocPanel));
    expect(html).toContain("toc-link");
    expect(typeof jump).toBe("function");
  });
});
