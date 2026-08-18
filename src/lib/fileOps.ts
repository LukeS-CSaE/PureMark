/**
 * 文件树写操作的 TS 封装（需求2 / T2 / 结论 #4）。
 *
 * 真实调用 Rust 命令（rename_file / delete_file / create_file / create_dir /
 * reveal_in_explorer），并在成功后：重建文件树、刷新受影响标签、关闭被删标签
 * （删除前复用需求1 的脏写守卫 requestCloseTab，保证一致性）。
 */
import { useUIStore } from "../store/useUIStore";
import { useTabsStore } from "../store/useTabsStore";
import {
  renameFileCmd,
  deleteFileCmd,
  createFileCmd,
  createDirCmd,
  revealInExplorerCmd,
  buildTree,
  readFileText,
} from "../commands/fsCommands";
import { requestCloseTab } from "../lib/closeGuard";
import { openInFocusedPane } from "../lib/paneRouter";
import { dirOf, joinPath } from "../lib/pathUtils";

/** 重建当前文件夹树（设计 §7.4）。 */
async function refreshTree(): Promise<void> {
  const folder = useUIStore.getState().currentFolder;
  if (!folder) return;
  try {
    const tree = await buildTree(folder);
    useUIStore.getState().setFolder(folder, tree);
  } catch (err) {
    console.error("[fileOps] 重建文件树失败:", err);
  }
}

/** 路径分隔符（与输入保持一致）。 */
function sepOf(path: string): string {
  return path.includes("\\") ? "\\" : "/";
}

/**
 * 重命名文件 / 目录（结论 #C 方案 a：仅更新打开标签的 path/name，避免误覆盖
 * 未保存改动；磁盘内容冲突交由需求1 冲突检测兜底）。
 */
export async function renameFile(path: string, newName: string): Promise<void> {
  const name = newName.trim();
  if (!name) return;
  await renameFileCmd(path, name);
  const newPath = joinPath(dirOf(path), name);
  useTabsStore.setState((s) => ({
    tabs: s.tabs.map((t) => (t.path === path ? { ...t, path: newPath, name } : t)),
  }));
  await refreshTree();
}

/** 删除文件 / 目录：先走脏写守卫关闭打开的标签，再删除并重建树。 */
export async function deleteFile(path: string): Promise<void> {
  const prefix = path + sepOf(path);
  const affected = useTabsStore
    .getState()
    .tabs.filter((t) => t.path === path || t.path.startsWith(prefix));
  for (const tab of affected) {
    await requestCloseTab(tab.id);
  }
  await deleteFileCmd(path);
  await refreshTree();
}

/** 新建文件：创建空文件、重建树，并自动在聚焦 pane 打开。 */
export async function createFile(dir: string, name: string): Promise<void> {
  const fileName = name.trim();
  if (!fileName) return;
  const full = joinPath(dir, fileName);
  await createFileCmd(full);
  await refreshTree();
  try {
    const content = await readFileText(full);
    openInFocusedPane({ path: full, name: fileName, content });
  } catch (err) {
    console.error("[fileOps] 打开新建文件失败:", err);
  }
}

/** 新建文件夹：创建空目录并重建树。 */
export async function createDir(dir: string, name: string): Promise<void> {
  const folderName = name.trim();
  if (!folderName) return;
  const full = joinPath(dir, folderName);
  await createDirCmd(full);
  await refreshTree();
}

/** 在资源管理器中显示（Windows explorer /select，macOS open -R，Linux xdg-open）。 */
export async function revealInExplorer(path: string): Promise<void> {
  await revealInExplorerCmd(path);
}

/** 复制路径到系统剪贴板。 */
export async function copyPath(path: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(path);
  }
}
