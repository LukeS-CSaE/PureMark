/**
 * 方案 B —— 外部改动非阻塞提示条（设计 §9 / T04）。
 *
 * 由 `useUIStore.externalChange` 驱动，从文件监视（fileWatcher）触发。
 * 提供两个动作：
 *  - [查看差异] → 打开代码差异对比页（含「采用磁盘版本」，
 *                 取代原提示条上的独立「重新加载」按钮）；
 *  - [忽略]     → 重置磁盘基线（不再提示本次改动，保留内存编辑）。
 */
import { useUIStore } from "../../store/useUIStore";
import { useTabsStore } from "../../store/useTabsStore";
import { captureDiskState } from "../../lib/conflictGuard";
import Icon from "../ui/Icon";

export default function ExternalChangeBar() {
  const notice = useUIStore((s) => s.externalChange);
  if (!notice) return null;

  const ui = useUIStore.getState();

  async function handleIgnore(): Promise<void> {
    const sig = await captureDiskState(notice!.path);
    if (sig) useTabsStore.getState().setDiskSignature(notice!.tabId, sig);
    ui.dismissExternalChange();
  }

  function handleViewConflict(): void {
    const tab = useTabsStore.getState().tabs.find((t) => t.id === notice!.tabId);
    if (tab) {
      ui.openConflictView({
        tabId: tab.id,
        name: tab.name,
        path: tab.path,
        diskContent: notice!.diskContent,
        memoryContent: tab.content,
        diskMtimeMs: notice!.diskMtimeMs,
        memoryDirty: tab.dirty,
      });
    }
    ui.dismissExternalChange();
  }

  return (
    <div className="ext-bar" role="alert">
      <Icon name="AlertTriangle" size={16} />
      <span className="ext-bar-text">「{notice.name}」已在外部被修改</span>
      <div className="ext-bar-actions">
        <button type="button" className="ext-bar-btn primary" onClick={() => void handleViewConflict()}>
          查看差异
        </button>
        <button type="button" className="ext-bar-btn subtle" onClick={() => void handleIgnore()}>
          忽略
        </button>
      </div>
    </div>
  );
}
