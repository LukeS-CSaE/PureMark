/**
 * 文件树右键菜单项构造（需求2 / T2）。
 *
 * 文件 / 目录节点分别构造不同菜单；写操作经 fileOps 真实调用 Rust 命令
 * （rename_file / delete_file / create_file / create_dir / reveal_in_explorer）。
 * 重命名 / 新建用 window.prompt 取名称（Tauri WebView 可用；后续可换自定义弹窗）。
 */
import type { FileNode, MenuItem } from "../types";
import { useUIStore } from "../store/useUIStore";
import { buildTree, readFileText } from "../commands/fsCommands";
import { openInFocusedPane } from "../lib/paneRouter";
import {
  renameFile,
  deleteFile,
  createFile,
  createDir,
  copyPath,
  revealInExplorer,
} from "../lib/fileOps";
import { ask } from "@tauri-apps/plugin-dialog";

/** 打开文件：读入内容并在聚焦 pane 打开。 */
async function openFile(node: FileNode): Promise<void> {
  const content = await readFileText(node.path);
  openInFocusedPane({ path: node.path, name: node.name, content });
}

/** 打开目录：将侧栏文件树导航进该文件夹。 */
async function openDir(path: string): Promise<void> {
  try {
    const tree = await buildTree(path);
    useUIStore.getState().setFolder(path, tree);
  } catch (err) {
    console.error("[fileContextMenu] 打开文件夹失败:", err);
  }
}

function promptRename(path: string, name: string): void {
  const next = window.prompt("重命名", name);
  if (next && next.trim() && next.trim() !== name) {
    void renameFile(path, next);
  }
}

function promptCreateFile(dir: string): void {
  const name = window.prompt("新建文件名", "未命名.md");
  if (name && name.trim()) void createFile(dir, name);
}

function promptCreateDir(dir: string): void {
  const name = window.prompt("新建文件夹名", "新建文件夹");
  if (name && name.trim()) void createDir(dir, name);
}

async function confirmDelete(path: string, name: string): Promise<void> {
  const ok = await ask(`确定要删除「${name}」吗？此操作不可撤销。`, {
    title: "删除",
    kind: "warning",
  });
  if (ok) await deleteFile(path);
}

/** 构造文件树节点的菜单项。 */
export function buildFileMenu(node: FileNode): MenuItem[] {
  if (node.isDir) {
    return [
      { id: "open", label: "打开", icon: "FolderOpen", run: () => void openDir(node.path) },
      { id: "newFile", label: "新建文件", icon: "FilePlus", run: () => promptCreateFile(node.path) },
      { id: "newDir", label: "新建文件夹", icon: "FolderPlus", run: () => promptCreateDir(node.path) },
      { id: "copyPath", label: "复制路径", icon: "Copy", run: () => void copyPath(node.path) },
      { separator: true, id: "sep-file-dir" },
      { id: "rename", label: "重命名", icon: "Pencil", run: () => promptRename(node.path, node.name) },
      { id: "delete", label: "删除", icon: "Trash2", run: () => void confirmDelete(node.path, node.name) },
    ];
  }
  return [
    { id: "open", label: "打开", icon: "FileText", run: () => void openFile(node) },
    {
      id: "reveal",
      label: "在资源管理器中显示",
      icon: "FolderOpen",
      run: () => void revealInExplorer(node.path),
    },
    { id: "copyPath", label: "复制路径", icon: "Copy", run: () => void copyPath(node.path) },
    { separator: true, id: "sep-file" },
    { id: "rename", label: "重命名", icon: "Pencil", run: () => promptRename(node.path, node.name) },
    { id: "delete", label: "删除", icon: "Trash2", run: () => void confirmDelete(node.path, node.name) },
  ];
}
