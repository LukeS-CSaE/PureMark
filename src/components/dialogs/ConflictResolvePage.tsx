/**
 * 文件内容冲突解决页（设计 §2 / T02 / T04）。
 *
 * 左右分屏：左 = 磁盘版本（只读），右 = 内存版本（只读）。
 * 中间差异用 `diffLines`（行级 LCS）高亮（设计 §1.3）。
 *
 * 动作：
 *  - [采用磁盘版本] → reloadFromDisk（buffer = 磁盘，干净）
 *  - [保留我的版本] → saveActive（内存写回磁盘，覆盖外部改动）
 *  - [取消]         → 回到编辑 / 保持窗口
 *
 * 由 `useUIStore.conflictView` 驱动，作为顶层 overlay 渲染。
 */
import { useUIStore } from "../../store/useUIStore";
import { useTabsStore } from "../../store/useTabsStore";
import { diffLines } from "../../lib/textDiff";
import Icon from "../ui/Icon";

export default function ConflictResolvePage() {
  const view = useUIStore((s) => s.conflictView);
  if (!view) return null;

  const lines = diffLines(view.diskContent, view.memoryContent);
  const close = useUIStore((s) => s.closeConflictView);

  async function handleUseDisk(): Promise<void> {
    await useTabsStore.getState().reloadFromDisk(view!.path, view!.diskContent);
    close();
  }

  async function handleKeepMine(): Promise<void> {
    await useTabsStore.getState().saveTab(view!.tabId);
    close();
  }

  function handleCancel(): void {
    close();
  }

  return (
    <div className="conflict-overlay" role="dialog" aria-modal="true" aria-label="文件内容冲突">
      <div className="conflict-page">
        <div className="conflict-head">
          <Icon name="AlertTriangle" size={18} />
          <span className="conflict-title">文件内容冲突：{view.name}</span>
          <span className="conflict-path" title={view.path}>
            {view.path}
          </span>
        </div>
        <p className="conflict-hint">
          磁盘版本（左）与当前编辑内容（右）不一致。可选择「采用磁盘版本」或「保留我的版本」，
          也可复制某侧内容到另一侧做手动合并后再保存。
        </p>
        <div className="conflict-cols">
          <div className="conflict-col">
            <div className="conflict-col-title">磁盘版本（只读）</div>
            <div className="conflict-pre scroll-thin">
              {lines.map((ln, i) => (
                <div
                  key={`d${i}`}
                  className={ln.kind === "equal" ? "diff-row" : "diff-row diff-hl"}
                >
                  {ln.left ?? ""}
                </div>
              ))}
            </div>
          </div>
          <div className="conflict-col">
            <div className="conflict-col-title">当前编辑内容（只读）</div>
            <div className="conflict-pre scroll-thin">
              {lines.map((ln, i) => (
                <div
                  key={`m${i}`}
                  className={ln.kind === "equal" ? "diff-row" : "diff-row diff-hl"}
                >
                  {ln.right ?? ""}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="conflict-actions">
          <button type="button" className="unsaved-btn primary" onClick={() => void handleUseDisk()}>
            采用磁盘版本
          </button>
          <button type="button" className="unsaved-btn" onClick={() => void handleKeepMine()}>
            保留我的版本
          </button>
          <button type="button" className="unsaved-btn subtle" onClick={handleCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
