/**
 * Live-preview line-decoration 回归保护 (live preview rewrite).
 *
 * 行级重写为 line-decoration 方案后, live 模式的块级样式由 `.cm-md-block-*`
 * 类驱动 (在 `.cm-live .cm-line` 上由 `LineDecoration` 添加). 这些测试从
 * 磁盘读取 `live.css` / `preview.css` / `main.tsx`, 断言:
 *   1. 每个 `.cm-md-block-*` 类都在 `live.css` 中声明了字号 / 字重
 *   2. `preview.css` 不再包含 `.cm-rendered-line` (旧 widget 方案的残留)
 *   3. `live.css` 不再包含 `.cm-rendered-line` (旧 widget 容器)
 *   4. CSS 加载顺序: preview.css 在 live.css 之后
 *
 * 这些断言防止将来某次"清理"误删块级类, 或误把旧 widget 选择器加回来.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const PREVIEW_CSS = resolve(HERE, "..", "styles", "preview.css");
const LIVE_CSS = resolve(HERE, "..", "styles", "live.css");
const MAIN_TSX = resolve(HERE, "..", "main.tsx");

const previewCss = readFileSync(PREVIEW_CSS, "utf8");
const liveCss = readFileSync(LIVE_CSS, "utf8");
const mainTsx = readFileSync(MAIN_TSX, "utf8");

/* ------------------------------------------------------------------ *
 * live.css — 块级类声明
 * ------------------------------------------------------------------ */

describe("live.css — .cm-md-block-* 块级类声明", () => {
  const blockClasses = [
    "cm-md-block-h1",
    "cm-md-block-h2",
    "cm-md-block-h3",
    "cm-md-block-h4",
    "cm-md-block-h5",
    "cm-md-block-h6",
    "cm-md-block-quote",
    "cm-md-block-list",
    "cm-md-block-code",
    "cm-md-block-hr",
  ];

  it.each(blockClasses)(".cm-live .%s 在 live.css 中声明", (cls) => {
    expect(liveCss).toContain(`.cm-live .${cls}`);
  });

  it("h1 用 2em 字号, 与 preview 一致", () => {
    expect(liveCss).toMatch(/\.cm-live \.cm-md-block-h1\s*\{[^}]*font-size:\s*2em/);
  });

  it("h2 用 1.5em 字号, 与 preview 一致", () => {
    expect(liveCss).toMatch(/\.cm-live \.cm-md-block-h2\s*\{[^}]*font-size:\s*1\.5em/);
  });

  it("h1 字重 700", () => {
    expect(liveCss).toMatch(/\.cm-live \.cm-md-block-h1\s*\{[^}]*font-weight:\s*700/);
  });

  it("quote 有左侧竖线 border-left", () => {
    expect(liveCss).toMatch(/\.cm-live \.cm-md-block-quote\s*\{[^}]*border-left/);
  });

  it("code 用 mono 字体", () => {
    expect(liveCss).toMatch(
      /\.cm-live \.cm-md-block-code\s*\{[^}]*font-family:\s*var\(--font-mono\)/,
    );
  });
});

/* ------------------------------------------------------------------ *
 * 旧 widget 容器残留检测 — 必须全部清除
 * ------------------------------------------------------------------ */

describe("live.css / preview.css — 旧 .cm-rendered-line 残留清除", () => {
  it("live.css 不再包含 .cm-rendered-line", () => {
    expect(liveCss).not.toContain(".cm-rendered-line");
  });

  it("preview.css 不再包含 .cm-rendered-line", () => {
    expect(previewCss).not.toContain(".cm-rendered-line");
  });
});

/* ------------------------------------------------------------------ *
 * main.tsx 的 CSS 加载顺序: preview.css 必须在 live.css 之后
 * ------------------------------------------------------------------ */

describe("main.tsx — CSS 加载顺序", () => {
  it("preview.css 必须在 live.css 之后加载", () => {
    const liveIdx = mainTsx.indexOf('import "./styles/live.css"');
    const previewIdx = mainTsx.indexOf('import "./styles/preview.css"');
    expect(liveIdx).toBeGreaterThan(-1);
    expect(previewIdx).toBeGreaterThan(-1);
    expect(previewIdx).toBeGreaterThan(liveIdx);
  });
});
