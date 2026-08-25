/**
 * 标签页右键菜单项构造（需求2 / T3）。
 *
 * 关闭类操作复用 useTabsStore.closeOthers/closeRight/closeLeft/closeAll，
 * 其内部逐项走 requestCloseTab 脏写守卫（设计 §7.6，与需求1 守卫一致）。
 */
import type { EditorTab, MenuItem } from "../types";
import { useTabsStore } from "../store/useTabsStore";
import { useUIStore } from "../store/useUIStore";
import { requestCloseTab } from "../lib/closeGuard";
import { copyPath, revealInExplorer, switchFolderRoot, renameFile } from "../lib/fileOps";
import { dirOf } from "../lib/pathUtils";

/** 重命名标签页：有路径时重命名磁盘文件并同步 tab，无路径时仅修改 tab 显示名。 */
function promptRenameTab(tab: EditorTab): void {
  useUIStore.getState().openRename({
    title: "重命名",
    defaultValue: tab.name,
    onSubmit: (name) => {
      if (tab.path) {
        // 有路径：走文件重命名（磁盘 rename + store 同步 + 树重建）
        void renameFile(tab.path, name);
      } else {
        // 无路径（未保存文档）：仅更新 tab 显示名
        useTabsStore.setState((s) => ({
          tabs: s.tabs.map((t) => (t.id === tab.id ? { ...t, name } : t)),
        }));
      }
    },
  });
}

/** 构造标签页菜单项。 */
export function buildTabMenu(tab: EditorTab): MenuItem[] {
  const hasPath = !!tab.path;
  const store = useTabsStore.getState();
  return [
    { id: "rename", label: "重命名", icon: "Pencil", run: () => promptRenameTab(tab) },
    { separator: true, id: "sep-tab-rename" },
    { id: "close", label: "关闭", icon: "X", run: () => void requestCloseTab(tab.id) },
    { id: "closeOthers", label: "关闭其他", run: () => void store.closeOthers(tab.id) },
    { id: "closeRight", label: "关闭右侧标签", run: () => void store.closeRight(tab.id) },
    { id: "closeLeft", label: "关闭左侧标签", run: () => void store.closeLeft(tab.id) },
    { id: "closeAll", label: "关闭全部", run: () => void store.closeAll() },
    { separator: true, id: "sep-tab" },
    {
      id: "copyPath",
      label: "复制路径",
      icon: "Copy",
      disabled: !hasPath,
      run: () => void copyPath(tab.path),
    },
    {
      id: "reveal",
      label: "在资源管理器中显示",
      icon: "FolderOpen",
      disabled: !hasPath,
      run: () => void revealInExplorer(tab.path),
    },
    {
      // 主动把侧栏文件目录切换到该 tab 文件所在文件夹：运行中从资源管理器
      // 打开新文件不再自动切目录，由本菜单项按需触发（见 App.tsx open-file）。
      id: "openFolder",
      label: "切换到该文件的目录",
      icon: "FolderTree",
      disabled: !hasPath,
      run: () => void switchFolderRoot(dirOf(tab.path)),
    },
  ];
}
