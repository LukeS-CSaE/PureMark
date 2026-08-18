/**
 * 标签页右键菜单项构造（需求2 / T3）。
 *
 * 关闭类操作复用 useTabsStore.closeOthers/closeRight/closeLeft/closeAll，
 * 其内部逐项走 requestCloseTab 脏写守卫（设计 §7.6，与需求1 守卫一致）。
 */
import type { EditorTab, MenuItem } from "../types";
import { useTabsStore } from "../store/useTabsStore";
import { requestCloseTab } from "../lib/closeGuard";
import { copyPath, revealInExplorer } from "../lib/fileOps";

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
  ];
}
