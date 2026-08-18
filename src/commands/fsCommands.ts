/**
 * Frontend <-> Rust bridge for filesystem operations. Everything that does not
 * require a custom Rust command is handled by the official Tauri plugins
 * (dialog / fs). Custom commands: `build_tree` + 编码感知读写
 * (`read_text_auto` / `write_text_enc`，支持 GBK/GB2312/GB18030/Big5/UTF-16)。
 */
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, stat } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import type { FileNode, FileMeta } from "../types";

const MARKDOWN_FILTER = [{ name: "Markdown", extensions: ["md", "markdown"] }];

/** Open a directory picker. Returns the chosen absolute path or null. */
export async function openFolderDialog(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false });
  return typeof result === "string" ? result : null;
}

/** Open a single Markdown file picker. Returns the path or null. */
export async function openFileDialog(): Promise<string | null> {
  const result = await open({ multiple: false, filters: MARKDOWN_FILTER });
  return typeof result === "string" ? result : null;
}

/** Save-as picker for untitled documents. Returns the path or null. */
export async function saveFileDialog(defaultPath?: string): Promise<string | null> {
  const result = await save({ defaultPath, filters: MARKDOWN_FILTER });
  return typeof result === "string" ? result : null;
}

/** Invoke the custom Rust command that builds the Markdown file tree. */
export async function buildTree(path: string): Promise<FileNode[]> {
  return invoke<FileNode[]>("build_tree", { path });
}

/** 编码感知的读取结果（与 Rust `ReadTextResult` 对齐）。 */
export interface FileTextResult {
  content: string;
  /** 规范化编码标签：utf-8 / gb18030 / big5 / utf-16le / utf-16be。 */
  encoding: string;
  /** 原文件是否带 BOM（保存时按原样写回）。 */
  hadBom: boolean;
}

/**
 * 读取文本文件并自动检测编码（UTF-8 / GBK / GB2312 / GB18030 / Big5 / UTF-16）。
 * 自定义命令不可用时（浏览器 dev / 旧二进制）降级为 plugin-fs 的 UTF-8 读取。
 */
export async function readFileTextWithEncoding(path: string): Promise<FileTextResult> {
  try {
    return await invoke<FileTextResult>("read_text_auto", { path });
  } catch {
    return { content: await readTextFile(path), encoding: "utf-8", hadBom: false };
  }
}

/** Read a text file (encoding auto-detected; content returned as UTF-8 字符串)。 */
export async function readFileText(path: string): Promise<string> {
  return (await readFileTextWithEncoding(path)).content;
}

/**
 * 按指定编码写回文本文件（默认 UTF-8）。原样保留原文件的编码与 BOM，
 * 避免把 GBK 文档保存成 UTF-8 造成外部工具乱码（防脏写）。
 * 命令不可用或目标编码无法表示内容时，降级为 UTF-8 写入保证不丢内容。
 */
export async function writeFileTextWithEncoding(
  path: string,
  content: string,
  encoding: string = "utf-8",
  hadBom: boolean = false,
): Promise<void> {
  try {
    await invoke("write_text_enc", { path, content, encoding, withBom: hadBom });
  } catch (err) {
    console.warn("[fs] 按原编码写入失败，降级为 UTF-8：", err);
    await writeTextFile(path, content);
  }
}

/** Write a UTF-8 text file. */
export async function writeFileText(path: string, content: string): Promise<void> {
  await writeTextFile(path, content);
}

/**
 * 读取文件元信息（mtime / size），封装 `@tauri-apps/plugin-fs` 的 `stat()`。
 * 用于 `diskSignature` 的 O(1) 快检与冲突检测（设计 §1.2 / D3）。
 * 文件不存在或 stat 失败时返回 `exists: false`。
 */
export async function readFileMeta(path: string): Promise<FileMeta> {
  try {
    const info = await stat(path);
    return {
      exists: true,
      mtimeMs: info.mtime ? info.mtime.getTime() : Date.now(),
      size: info.size,
    };
  } catch {
    return { exists: false, mtimeMs: 0, size: 0 };
  }
}

/* ---- 需求2：文件树写操作（自定义 Rust 命令封装） ----------------------- */

/** 重命名文件 / 目录。 */
export async function renameFileCmd(path: string, newName: string): Promise<void> {
  await invoke("rename_file", { path, newName });
}

/** 删除文件 / 目录。 */
export async function deleteFileCmd(path: string): Promise<void> {
  await invoke("delete_file", { path });
}

/** 新建空文件。 */
export async function createFileCmd(path: string): Promise<void> {
  await invoke("create_file", { path });
}

/** 新建目录。 */
export async function createDirCmd(path: string): Promise<void> {
  await invoke("create_dir", { path });
}

/** 在资源管理器中显示。 */
export async function revealInExplorerCmd(path: string): Promise<void> {
  await invoke("reveal_in_explorer", { path });
}
