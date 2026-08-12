/**
 * Phase 0 续：源码保留型序列化器（source-preserving）可行性证明。
 *
 * 思路（MarkText 同款）：
 *   - 加载时把原文按顶层块切成切片，每块存「原始 markdown 文本 + 结构签名 + 字符偏移」。
 *   - 分隔符用字符偏移从原文精确截取，避免 markdown-it .map 行边界的 off-by-one。
 *   - 序列化时：未改动块 → 原样吐回原始文本（字节一致）；改动块 → 用默认 serializer 重生成。
 */
import { defaultMarkdownParser, defaultMarkdownSerializer } from "prosemirror-markdown";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt("commonmark", { html: false });
const schema = defaultMarkdownParser.schema;

const SAMPLE = `# 标题

这是一段**加粗**和*斜体*文字，还有\`行内代码\`。

- 项目一
- 项目二

> 引用第一行
> 引用第二行

\`\`\`js
const a = 1;
\`\`\`

结尾段落。
`;

/** 把原文切成顶层块切片（每块带原始 markdown + 字符偏移）。 */
function sliceSource(text) {
  const tokens = md.parse(text, {});
  const lines = text.split("\n");
  const lineStart = [];
  let acc = 0;
  for (const ln of lines) {
    lineStart.push(acc);
    acc += ln.length + 1; // +1 含换行符
  }
  const blocks = [];
  for (const t of tokens) {
    if (t.level !== 0 || !t.map) continue;
    if (!/_(open)$/.test(t.type) && !["fence", "hr", "code_block", "html_block"].includes(t.type)) continue;
    const [s, e] = t.map;
    const src = lines.slice(s, e).join("\n");
    const charStart = lineStart[s];
    const charEnd = e - 1 >= 0 ? lineStart[e - 1] + lines[e - 1].length : lineStart[s];
    blocks.push({ src, s, e, charStart, charEnd });
  }
  return { blocks, lines, text };
}

/** 从原始文本精确截取分隔符（块前导 / 块间 / 尾部）。 */
function separators(blocks, text) {
  const seps = [text.slice(0, blocks[0]?.charStart ?? 0)];
  for (let k = 1; k < blocks.length; k++) {
    seps.push(text.slice(blocks[k - 1].charEnd, blocks[k].charStart));
  }
  seps.push(text.slice(blocks[blocks.length - 1]?.charEnd ?? text.length));
  return seps;
}

/** 节点结构签名：类型 + 属性 + 纯文本。 */
function sig(node) {
  return node.type.name + " " + JSON.stringify(node.attrs) + " " + node.textContent;
}

function load(text) {
  const doc = defaultMarkdownParser.parse(text);
  const { blocks, lines, text: src } = sliceSource(text);
  const seps = separators(blocks, src);
  let i = 0;
  doc.forEach((node) => {
    if (i < blocks.length) {
      blocks[i].sig = sig(node);
      i++;
    }
  });
  return { doc, blocks, seps, ok: i === blocks.length };
}

function serialize(doc, blocks, seps) {
  let r = seps[0];
  let k = 0;
  doc.forEach((node) => {
    const blk = blocks[k];
    if (blk && blk.sig === sig(node)) {
      r += blk.src;
    } else {
      r += defaultMarkdownSerializer
        .serialize(schema.nodes.doc.create(null, node))
        .replace(/\n+$/, "");
    }
    r += seps[k + 1] ?? "";
    k++;
  });
  return r;
}

/* ---- 测试 1：未编辑 → 字节级一致 ---- */
const { doc, blocks, seps, ok } = load(SAMPLE);
const rebuilt = serialize(doc, blocks, seps);
const t1 = rebuilt === SAMPLE;
console.log("测试1 未编辑序列化字节一致:", t1, "| 块数/子节点匹配:", ok, `(${blocks.length} blocks)`);
if (!t1) {
  console.log("--- diff ---");
  const a = SAMPLE.split("\n"), b = rebuilt.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if (a[i] !== b[i]) console.log(`L${i + 1}\n- ${a[i] ?? ""}\n+ ${b[i] ?? ""}`);
}

/* ---- 测试 2：仅最后一段被标记改动 → 仅该块重生成，其余字节一致 ---- */
blocks[blocks.length - 1].sig = "FORCED_REGEN"; // 模拟该块被用户编辑
const out2 = serialize(doc, blocks, seps);
let changed = 0;
let k2 = 0;
doc.forEach((node) => {
  if (blocks[k2].sig !== sig(node)) changed++;
  k2++;
});
console.log("\n测试2 仅最后一段改动 → 变化块数:", changed, "/", blocks.length);
console.log("未改动块字节仍保留('- 项目一'):", out2.includes("- 项目一"));
console.log("改动块已重生成('结尾段落'):", out2.includes("结尾段落。"));
console.log("--- 测试2 输出 ---\n" + out2);
