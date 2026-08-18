/**
 * 源码保留型序列化器 — 主逻辑。
 *
 * 给定当前 ProseMirror 文档 `doc`、最初加载并解析出的 `originalDoc`（同一份
 * markdown 解析后的 PM 文档）、最初加载的 `original` markdown 文本，以及一个
 * 「单块默认序列化器」`serializeNode`，产出最终 markdown：
 *   - 顶层块若结构签名（类型 + attrs + 纯文本）与 `originalDoc` 对应块一致
 *     → 原样吐回该块的 `block.src`（字节一致，用户原有换行/空行/缩进全保留）
 *   - 顶层块若签名变化（用户编辑 / 新增）→ 用 `serializeNode` 重生成
 *
 * 选择 `originalDoc`（已解析的 PM 文档）而非原始文本作为签名基准，是因为签名必须
 * 在「PM 节点空间」内比较：只有把同一份 markdown 解析成 PM 文档，才能得到与当前
 * 文档可逐块对比的结构指纹。编辑器在加载完成后即捕获 `originalDoc`，保证基准稳定。
 *
 * 分隔符：相邻两块的「前导/块间」分隔符在两者都未改动时沿用原文。当顶层块数在
 * 编辑过程中发生变化（结构大幅变化）时 `matched=false`，调用方应退化为整文档
 * 默认序列化（正确性优先于字节保真）。
 */
import type { Node as PMNode } from "@tiptap/pm/model";
import { sliceSource } from "./sourceSlice";

/** 节点结构签名：类型 + 属性 + 纯文本。 */
export function nodeSignature(node: PMNode): string {
  return node.type.name + " " + JSON.stringify(node.attrs) + " " + node.textContent;
}

export interface SourcePreservingResult {
  markdown: string;
  /** 当前文档与原始文档顶层块数是否一致；不一致时不保证字节保真。 */
  matched: boolean;
}

export function serializeSourcePreserving(
  doc: PMNode,
  originalDoc: PMNode,
  original: string,
  serializeNode: (node: PMNode) => string,
): SourcePreservingResult {
  const { blocks, seps } = sliceSource(original);

  // 结构对齐：当前文档、原始文档、源码切片三者顶层块数必须一致，才逐块保真。
  const paired = doc.childCount === originalDoc.childCount && originalDoc.childCount === blocks.length;

  let out = paired ? seps[0] ?? "" : "";
  const total = doc.childCount;
  for (let k = 0; k < total; k++) {
    const curNode = doc.child(k);
    // 仅当结构对齐、且索引未越界时，才回退到「原块字节」或「签名比对」。
    // 未对齐（如新建空文档首行后敲回车、块数增多）必须全量重序列化，
    // 否则 originalDoc.child(k) 会越界抛错，导致 live 视图写回 store 中断、
    // 切换 edit/preview 时内容丢失（见 issue）。
    const origNode = paired && k < originalDoc.childCount ? originalDoc.child(k) : null;
    const blk = paired && k < blocks.length ? blocks[k] : null;
    if (origNode && blk && nodeSignature(curNode) === nodeSignature(origNode)) {
      out += blk.src; // 未改动：字节级原样回写
    } else {
      out += serializeNode(curNode).replace(/\n+$/, "");
    }
    if (paired && k + 1 < seps.length) {
      out += seps[k + 1];
    } else if (k < total - 1) {
      out += "\n\n"; // 新增/未对齐块之间：规范空行
    }
  }

  return { markdown: out, matched: paired };
}
