/**
 * 关闭守卫（设计 §2 / T04）。
 *
 *  - `requestCloseTab(id)`：标签级关闭守卫。脏则先检测冲突，再确认
 *    （含「查看冲突」）；非冲突脏则走旧的两按钮确认（向后兼容）。
 *  - `guardWindowClose()`：窗口级关闭守卫流程，由 `registerCloseGuard`
 *    调用。无未保存改动直接放行；否则检测冲突 → 自定义弹窗 → 决策
 *    （保存 / 不保存 / 查看冲突 / 取消）。返回 true 表示可销毁窗口，
 *    false 表示保持窗口。
 *
 * 既有关闭守卫（方案 A）保留复用；方案 B 的实时提示条由 fileWatcher 单独驱动。
 */
import type { EditorTab } from "../types";
import { useTabsStore } from "../store/useTabsStore";
import { useUIStore } from "../store/useUIStore";
import { detectConflict, buildConflictViewModel } from "./conflictGuard";
import { confirmClose, confirmUnsaved } from "../components/dialogs/UnsavedDialog";

/** 标签级关闭守卫：脏则先检测冲突，再确认（含「查看冲突」）。 */
export async function requestCloseTab(id: string): Promise<void> {
  const tab = useTabsStore.getState().tabs.find((t) => t.id === id);
  if (!tab) return;
  if (tab.dirty) {
    const state = await detectConflict(tab);
    if (state.hasConflict) {
      const decision = await confirmClose(true, [tab.name]);
      if (decision === "cancel") return;
      if (decision === "save") {
        await useTabsStore.getState().saveTab(id);
        useTabsStore.getState().closeTab(id);
        return;
      }
      if (decision === "discard") {
        useTabsStore.getState().closeTab(id);
        return;
      }
      // viewConflict → 打开冲突解决页，本次不关闭标签
      const model = buildConflictViewModel(tab, state.diskContent, state.diskSignature.mtimeMs);
      useUIStore.getState().openConflictView(model);
      return;
    }
    const ok = await confirmUnsaved(tab.name);
    if (!ok) return;
  }
  useTabsStore.getState().closeTab(id);
}

/**
 * 窗口级关闭守卫流程（由 registerCloseGuard 调用）。
 * 返回 true 表示可以继续销毁窗口；false 表示保持窗口。
 */
export async function guardWindowClose(): Promise<boolean> {
  const tabs = useTabsStore.getState();
  if (!tabs.isAnyDirty()) return true;

  const dirtyTabs = tabs.tabs.filter((t) => t.dirty);
  let conflictTab: { tab: EditorTab; diskContent: string; mtimeMs: number } | null = null;
  for (const t of dirtyTabs) {
    const st = await detectConflict(t);
    if (st.hasConflict) {
      conflictTab = { tab: t, diskContent: st.diskContent, mtimeMs: st.diskSignature.mtimeMs };
      break;
    }
  }

  const names = dirtyTabs.map((t) => t.name);
  const decision = await confirmClose(conflictTab !== null, names);
  switch (decision) {
    case "save":
      for (const t of dirtyTabs) await useTabsStore.getState().saveTab(t.id);
      return true;
    case "discard":
      return true;
    case "viewConflict":
      if (conflictTab) {
        useUIStore.getState().openConflictView(
          buildConflictViewModel(conflictTab.tab, conflictTab.diskContent, conflictTab.mtimeMs),
        );
      }
      return false;
    case "cancel":
    default:
      return false;
  }
}
