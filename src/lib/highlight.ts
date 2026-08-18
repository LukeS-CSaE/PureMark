/**
 * highlight.js initialization. Only the common languages used for Markdown
 * authoring are registered to keep the bundle small (per the system design).
 *
 * 语言字典 `hljsLanguages` 同时被本文件的注册与 `lowlight.ts`（TipTap 代码块
 * 高亮）复用，保证两处语言集永不漂移；别名（js/ts/html/sh/py 等）由
 * highlight.js / lowlight 从语言定义中自动注册。
 */
import hljs from "highlight.js/lib/core";
import type { LanguageFn } from "highlight.js";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";

/** 常用语言集（单一数据源；新增语言只改这里）。 */
export const hljsLanguages: Readonly<Record<string, LanguageFn>> = {
  javascript,
  typescript,
  xml, // used for HTML
  css,
  json,
  bash,
  markdown,
  python,
};

for (const [name, def] of Object.entries(hljsLanguages)) {
  hljs.registerLanguage(name, def);
}

/** Highlight a single `<code>` element produced by marked. */
export function highlightElement(el: HTMLElement): void {
  try {
    hljs.highlightElement(el);
  } catch {
    /* unknown language — leave as-is */
  }
}

export default hljs;
