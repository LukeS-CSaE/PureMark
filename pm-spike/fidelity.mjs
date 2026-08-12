/**
 * Phase 0 探针：用 prosemirror-markdown 的默认 parser/serializer，
 * 对一批真实 .md 跑「parse -> serialize」字节级往返，量化保真率。
 *
 * 目的不是证明它能保真（默认 serializer 一定会规范化，必然字节不一致），
 * 而是用真实语料量化：
 *   1. byteEqual      —— 输出与原文逐字节相同（用户要求的硬指标）
 *   2. semanticEqual  —— 重新 parse 输出后文档树与原文档树一致（仅格式差异）
 * 两者之差 = 「只是排版被规范化」vs「内容/结构有损失」，决定我们要补多少自定义工作。
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultMarkdownParser, defaultMarkdownSerializer } from "prosemirror-markdown";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, ".."); // 项目根

const corpus = [
  "docs/项目认知与现状总览.md",
  "Markdown渲染测试文档.md",
  "对齐规格_SoloMD.md",
  "docs/prd-iter2.md",
  "docs/design-iter2.md",
  "docs/prd-iter2-ext.md",
].map((p) => join(ROOT, p));

function diffLines(a, b, max = 25) {
  const al = a.split("\n");
  const bl = b.split("\n");
  const out = [];
  const n = Math.max(al.length, bl.length);
  for (let i = 0; i < n; i++) {
    if (al[i] !== bl[i]) {
      out.push(`L${i + 1}\n- ${al[i] ?? ""}\n+ ${bl[i] ?? ""}`);
      if (out.length >= max) break;
    }
  }
  return out.join("\n");
}

let total = 0;
let byteEqual = 0;
let byteEqualTrim = 0;
let semanticEqual = 0;
const report = [];

for (const file of corpus) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  total++;
  const doc = defaultMarkdownParser.parse(text);
  const out = defaultMarkdownSerializer.serialize(doc);
  const be = out === text;
  const beT = out.replace(/\n+$/, "") === text.replace(/\n+$/, "");
  let se = false;
  try {
    const doc2 = defaultMarkdownParser.parse(out);
    se = JSON.stringify(doc.toJSON()) === JSON.stringify(doc2.toJSON());
  } catch {
    /* parse failure of output -> not semantically equal */
  }
  if (be) byteEqual++;
  if (beT) byteEqualTrim++;
  if (se) semanticEqual++;
  report.push({
    file: file.replace(ROOT + "/", ""),
    be,
    beT,
    se,
    inLen: text.length,
    outLen: out.length,
    diff: be ? "" : diffLines(text, out),
  });
}

console.log("=== Markdown 往返保真探针 (prosemirror-markdown default) ===\n");
for (const r of report) {
  console.log(`## ${r.file}`);
  console.log(
    `byteEqual=${r.be} byteEqual(去尾空行)=${r.beT} semanticEqual=${r.se} in=${r.inLen} out=${r.outLen}`,
  );
  if (!r.be) console.log(r.diff + "\n");
}
console.log(
  `\n=== SUMMARY: byteEqual ${byteEqual}/${total}, byteEqual(trim) ${byteEqualTrim}/${total}, semanticEqual ${semanticEqual}/${total} ===`,
);
