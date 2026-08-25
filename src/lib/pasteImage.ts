/**
 * 剪贴板图片粘贴核心逻辑（两个编辑器共用）。
 *
 * 流程：
 *   1. 从 DataTransfer 提取 image/* Blob
 *   2. 计算保存路径：dirOf(tabPath)/assets/image-<时间戳>.<ext>
 *   3. 调用 writeBinaryFile 写入磁盘
 *   4. 返回相对 markdown 引用路径（如 `assets/image-xxx.png`）
 *
 * 返回 null 表示剪贴板无图片（调用方应回退到默认粘贴）。
 */
import { writeBinaryFile } from "../commands/fsCommands";
import { dirOf, joinPath } from "./pathUtils";

/** MIME 类型到文件扩展名的映射。 */
const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

/** 把 Date 格式化为 YYYYMMDD-HHmmss（本地时间）。 */
function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/** 从 DataTransfer 中提取第一个 image/* 项的 Blob，无图片返回 null。 */
export function extractImageBlob(dataTransfer: DataTransfer): Blob | null {
  for (let i = 0; i < dataTransfer.items.length; i++) {
    const item = dataTransfer.items[i];
    if (item.kind === "file" && item.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }
  return null;
}

/** 检测 DataTransfer 是否包含图片项（同步，用于事件拦截判断）。 */
export function hasImageItem(items: DataTransferItemList): boolean {
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind === "file" && items[i].type.startsWith("image/")) {
      return true;
    }
  }
  return false;
}

/** 根据 Blob MIME 推断扩展名，未知类型默认 png。 */
export function extensionForMime(mime: string): string {
  return MIME_EXT[mime] ?? "png";
}

/** 构造图片文件名：image-YYYYMMDD-HHmmss.ext */
export function buildImageFileName(mime: string, now: Date = new Date()): string {
  return `image-${formatTimestamp(now)}.${extensionForMime(mime)}`;
}

/**
 * 处理剪贴板图片粘贴：提取图片 → 保存到磁盘 → 返回相对路径。
 * 返回 null 表示剪贴板不含图片，调用方应回退默认粘贴行为。
 *
 * @param clipboardData 粘贴事件的 DataTransfer
 * @param tabPath 当前编辑文档的绝对路径（必须非空）
 */
export async function handleImagePaste(
  clipboardData: DataTransfer,
  tabPath: string,
): Promise<string | null> {
  const blob = extractImageBlob(clipboardData);
  if (!blob) return null;

  const fileName = buildImageFileName(blob.type);
  const docDir = dirOf(tabPath);
  const absPath = joinPath(joinPath(docDir, "assets"), fileName);
  // 相对路径（markdown 引用）：assets/xxx.png
  const relPath = `assets/${fileName}`;

  // Blob → ArrayBuffer → Uint8Array → 写入磁盘
  const buffer = await blob.arrayBuffer();
  await writeBinaryFile(absPath, new Uint8Array(buffer));

  return relPath;
}
