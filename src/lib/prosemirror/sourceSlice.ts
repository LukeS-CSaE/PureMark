/**
 * 源码保留型序列化器 — 切片层（schema 无关）。
 *
 * 把一份原始 Markdown 按「顶层块」切成切片，每块保留：
 *   - `src`        原始 markdown 文本（字节）
 *   - `s` / `e`    起止行（0-based，e 独占）
 *   - `charStart` / `charEnd` 字符偏移（用于精确截取分隔符，避免行边界 off-by-one）
 *
 * 分隔符（块前导 / 块间 / 尾部）按字符偏移从原文精确截取，从而未改动块原样
 * 回写时能 100% 保留用户原有的换行 / 空行 / 缩进风格。
 *
 * 使用 markdown-it 的 GFM 模式（开启 table / strikethrough），使表格等 GFM
 * 结构被识别为顶层块；任务列表在 markdown-it 默认解析下仍是普通 bullet_list，
 * 由下游签名差异决定重序列化（见 sourcePreserving.ts）。
 */
import MarkdownIt from "markdown-it";

// GFM 模式（非 commonmark）：开启表格、删除线等。
const md = new MarkdownIt({ html: false, linkify: false, typographer: false });

export interface SourceBlock {
  /** 原始 markdown 文本（字节级）。 */
  src: string;
  /** 起始行（0-based）。 */
  s: number;
  /** 结束行（独占）。 */
  e: number;
  /** 字符起始偏移。 */
  charStart: number;
  /** 字符结束偏移。 */
  charEnd: number;
  /** 结构签名，由下游填充（node 类型 + attrs + 纯文本）。 */
  sig?: string;
}

export interface SourceSlices {
  blocks: SourceBlock[];
  /** 长度为 blocks.length + 1 的分隔符数组（前导 / 块间 / 尾部）。 */
  seps: string[];
  lines: string[];
}

export function sliceSource(text: string): SourceSlices {
  const tokens = md.parse(text, {});
  const lines = text.split("\n");
  const lineStart: number[] = [];
  let acc = 0;
  for (const ln of lines) {
    lineStart.push(acc);
    acc += ln.length + 1; // +1 含换行符
  }
  const blocks: SourceBlock[] = [];
  for (const t of tokens) {
    if (t.level !== 0 || !t.map) continue;
    // 仅在顶层块级 token 上切片：_*（open）或自闭合块（fence/hr/code_block/html_block）。
    if (!/_(open)$/.test(t.type) && !["fence", "hr", "code_block", "html_block"].includes(t.type)) {
      continue;
    }
    const [s, e] = t.map;
    const src = lines.slice(s, e).join("\n");
    const charStart = lineStart[s];
    const charEnd = e - 1 >= 0 ? lineStart[e - 1] + lines[e - 1].length : lineStart[s];
    blocks.push({ src, s, e, charStart, charEnd });
  }

  const seps: string[] = [text.slice(0, blocks[0]?.charStart ?? 0)];
  for (let k = 1; k < blocks.length; k++) {
    seps.push(text.slice(blocks[k - 1].charEnd, blocks[k].charStart));
  }
  seps.push(text.slice(blocks[blocks.length - 1]?.charEnd ?? text.length));

  return { blocks, seps, lines };
}
