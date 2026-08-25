/**
 * 本地图片感知的 Image 扩展。
 *
 * 标准 TipTap Image 直接把 src 原样塞进 `<img>`，相对路径在 WebView 里 404。
 * 这里重写 `renderHTML`：经 `resolveImageSrc` 把相对路径转成 asset 协议 URL，
 * 而节点 `attrs.src` 仍存相对路径（保证序列化回 markdown 仍是相对路径、文件
 * 可移植）。`documentDir` 由 `buildEditorExtensions` 在编辑器构建时按当前文档
 * 目录注入，tab 切换 / 保存后路径变更时重建编辑器即可更新。
 */
import Image, { type ImageOptions } from "@tiptap/extension-image";
import { convertFileSrc } from "@tauri-apps/api/core";
import { resolveImageSrc } from "./localImage";

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
      documentDir: "",
    };
  },
  renderHTML({ HTMLAttributes }) {
    const documentDir = this.options.documentDir;
    const src = (HTMLAttributes.src as string | undefined) ?? "";
    const resolved = resolveImageSrc(src, documentDir, convertFileSrc);
    return ["img", { ...HTMLAttributes, src: resolved }];
  },
});
