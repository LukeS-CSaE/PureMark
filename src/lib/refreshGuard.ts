/**
 * 刷新守卫（设计 §2 / T03 / T04）。
 *
 * 编排一次「应用内刷新」：
 *  1. 取活动 tab；无路径（未保存文档）则无事可刷新，直接返回；
 *  2. 若存在未保存改动 → 弹刷新确认（保存并刷新 / 不保存 / 取消）；
 *  3. 从磁盘重载当前文档 buffer（保留 React 外壳，不整窗 reload）；
 *  4. reloadFromDisk 会清除该 path 的自动保存草稿（设计 §7.1）。
 */
import { useTabsStore } from "../store/useTabsStore";
import { readFileText } from "../commands/fsCommands";
import { confirmRefresh } from "../components/dialogs/UnsavedDialog";

export async function guardRefresh(): Promise<void> {
  const tabs = useTabsStore.getState();
  const active = tabs.getActive();
  if (!active || !active.path) {
    // 没有可刷新的磁盘文件：未保存文档无法「从磁盘重载」，静默忽略
    return;
  }

  if (tabs.isAnyDirty()) {
    const decision = await confirmRefresh([active.name]);
    if (decision === "cancel") return;
    if (decision === "saveReload") {
      await tabs.saveActive();
    }
    // 'discardReload' → 直接重载，丢弃内存改动
  }

  const diskContent = await readFileText(active.path);
  await tabs.reloadFromDisk(active.path, diskContent);
}
