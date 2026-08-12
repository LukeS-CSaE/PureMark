/**
 * Frontend <-> Rust bridge for filesystem operations. Everything that does not
 * require a custom Rust command is handled by the official Tauri plugins
 * (dialog / fs). The only custom command is `build_tree`.
 */
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import type { FileNode } from "../types";

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

/** Read a UTF-8 text file. */
export async function readFileText(path: string): Promise<string> {
  return readTextFile(path);
}

/** Write a UTF-8 text file. */
export async function writeFileText(path: string, content: string): Promise<void> {
  await writeTextFile(path, content);
}
