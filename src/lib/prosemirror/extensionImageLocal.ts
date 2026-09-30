/**
 * 本地图片感知的 Image 扩展。
 *
 * 标准 TipTap Image 直接把 src 原样塞进 `<img>`，相对路径在 WebView 里 404。
 * 这里重写 `renderHTML`：经 `resolveImageSrc` 把相对路径转成 asset 协议 URL，
 * 而节点 `attrs.src` 仍存相对路径（保证序列化回 markdown 仍是相对路径、文件
 * 可移植）。`documentDir` 由 `buildEditorExtensions` 在编辑器构建时按当前文档
 * 目录注入，tab 切换 / 保存后路径变更时重建编辑器即可更新。
 *
 * 另补齐两处默认行为缺口：
 *   - `allowBase64: true`：TipTap Image 默认丢弃 `data:` 图片（parseHTML 的
 *     `:not([src^="data:"])` 选择器），markdown 里内嵌 base64 图片会被静默吞掉。
 *   - `storage.markdown.parse.setup`：向 tiptap-markdown 内部的 markdown-it
 *     注册「宽松图片路径」core 规则（lenientImage.ts），容忍 URL 未编码空格
 *     （`![a](my img.png)`），与 Typora 行为对齐。按节点名 `image` 与
 *     tiptap-markdown 内置 spec 合并，serialize 沿用其默认实现。
 */
import Image, { type ImageOptions } from "@tiptap/extension-image";
import { convertFileSrc } from "@tauri-apps/api/core";
import { resolveImageSrc } from "./localImage";
import { registerLenientImageRule } from "./lenientImage";

/** LocalImage 的 options：在 Image 基础上加文档目录，用于解析本地图片。 */
export interface LocalImageOptions extends ImageOptions {
  /** 当前文档所在目录（绝对路径），用于把相对图片路径解析为 asset URL。 */
  documentDir: string;
}

// 显式指定泛型：`Image.extend` 的 ExtendedOptions 默认回退为 ImageOptions
// （addOptions 里 this.parent 造成循环推断，TS 不会自动带上 documentDir），
// 导致 configure({ documentDir }) 报 TS2353。此处显式声明含 documentDir 的 options 类型。
export const LocalImage = Image.extend<LocalImageOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      // data: 内嵌图片默认被 parseHTML 选择器丢弃，显式放行。
      allowBase64: true,
      documentDir: "",
    };
  },
  addStorage() {
    return {
      markdown: {
        parse: {
          // 签名由 tiptap-markdown 约定：setup.call({ editor, options }, mdInstance)。
          setup(this: unknown, md: unknown): void {
            registerLenientImageRule(md as Parameters<typeof registerLenientImageRule>[0]);
          },
        },
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const documentDir = this.options.documentDir;
    const src = (HTMLAttributes.src as string | undefined) ?? "";
    const resolved = resolveImageSrc(src, documentDir, convertFileSrc);
    return ["img", { ...HTMLAttributes, src: resolved }];
  },
});
