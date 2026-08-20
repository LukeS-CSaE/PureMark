/**
 * 标签页右键菜单项构造（需求2 / T3）。
 *
 * 关闭类操作复用 useTabsStore.closeOthers/closeRight/closeLeft/closeAll，
 * 其内部逐项走 requestCloseTab 脏写守卫（设计 §7.6，与需求1 守卫一致）。
 */
import type { EditorTab, MenuItem } from "../types";
import { useTabsStore } from "../store/useTabsStore";
import { requestCloseTab } from "../lib/closeGuard";
import { copyPath, revealInExplorer, switchFolderRoot } from "../lib/fileOps";
import { dirOf } from "../lib/pathUtils";

/** 构造标签页菜单项。 */
export function buildTabMenu(tab: EditorTab): MenuItem[] {
  const hasPath = !!tab.path;
  const store = useTabsStore.getState();
  return [
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
