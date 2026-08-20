/**
 * 文件内容冲突解决页（设计 §2 / T02 / T04）。
 *
 * 代码差异对比视图：左右分栏（左 = 磁盘版本，右 = 当前编辑内容），
 * 行级 LCS 对齐 + 双侧行号，删除行红色 / 新增行绿色 / 缺失侧灰色占位，
 * 与常见代码 diff 工具的阅读体验一致（设计 §1.3）。
 *
 * 逐段取舍：每段连续差异块上方有左右箭头按钮——
 *  - [← 用磁盘内容覆盖此段] → 该块采用磁盘侧内容；
 *  - [保留我的此段内容 →]   → 该块保留内存侧内容。
 * 已取舍的块渲染为横跨两栏的合并行（点击可撤销），底部「应用合并结果」
 * 把合并内容写回编辑器并落盘。
 *
 * 整体动作：
 *  - [采用磁盘版本] → reloadFromDisk（buffer = 磁盘，干净）
 *  - [保留我的版本] → saveActive（内存写回磁盘，覆盖外部改动）
 *  - [取消]         → 回到编辑 / 保持窗口
 *
 * 由 `useUIStore.conflictView` 驱动，作为顶层 overlay 渲染。
 */
import { useState } from "react";
import { useUIStore } from "../../store/useUIStore";
import { useTabsStore } from "../../store/useTabsStore";
import {
  diffLines,
  numberDiffRows,
  groupDiffHunks,
  buildMergedLines,
  type DiffRow,
  type HunkChoice,
} from "../../lib/textDiff";
import Icon from "../ui/Icon";

/** 左（磁盘）侧某行的样式：被改/被删红色，仅右侧有的行灰色占位。 */
function leftRowClass(row: DiffRow): string {
  if (row.kind === "equal") return "diff-row";
  if (row.left === null) return "diff-row diff-empty";
  return "diff-row diff-del";
}

/** 右（内存）侧某行的样式：新增/修改绿色，仅左侧有的行灰色占位。 */
function rightRowClass(row: DiffRow): string {
  if (row.kind === "equal") return "diff-row";
  if (row.right === null) return "diff-row diff-empty";
  return "diff-row diff-ins";
}

/** 渲染段：差异块操作条 / 已取舍合并行 / 普通左右对照行。 */
type Segment =
  | { type: "bar"; hi: number }
  | { type: "resolved"; hi: number; choice: HunkChoice; text: string; k: number; empty: boolean }
  | { type: "row"; row: DiffRow; i: number };

export default function ConflictResolvePage() {
  const view = useUIStore((s) => s.conflictView);
  // 逐段取舍的本地状态。所有 hook 必须都在条件早退之前调用，否则 view
  // 从 null 变非 null 时 hook 数量变化，触发 React "Rendered more hooks" 报错。
  const [choices, setChoices] = useState<(HunkChoice | null)[]>([]);
  const close = useUIStore((s) => s.closeConflictView);

  // 换一份冲突快照（不同文件 / 内容刷新）时清空取舍。渲染期重置派生状态
  // 是 React 官方推荐模式，避免 useEffect 多渲染一帧旧状态。
  const viewKey = view
    ? `${view.tabId}|${view.path}|${view.diskContent.length}|${view.memoryContent.length}`
    : "";
  const [seenKey, setSeenKey] = useState(viewKey);
  if (seenKey !== viewKey) {
    setSeenKey(viewKey);
    setChoices([]);
  }

  if (!view) return null;

  const diff = diffLines(view.diskContent, view.memoryContent);
  const rows = numberDiffRows(diff);
  const hunks = groupDiffHunks(diff);
  // 变更统计：modify 同时计入两侧，与常见 diff 工具的 +n −m 语义一致。
  const removed = diff.filter((d) => d.kind === "remove" || d.kind === "modify").length;
  const added = diff.filter((d) => d.kind === "add" || d.kind === "modify").length;

  /** 行 → 所属差异块下标（块外为 null）。 */
  const hunkByRow: (number | null)[] = new Array(rows.length).fill(null);
  hunks.forEach((h, hi) => {
    for (let r = h.rowStart; r < h.rowEnd; r++) hunkByRow[r] = hi;
  });

  /** 点箭头取舍该块；重复点同一箭头 = 撤销。 */
  function resolveHunk(index: number, choice: HunkChoice): void {
    setChoices((prev) => {
      const next = prev.slice();
      next[index] = next[index] === choice ? null : choice;
      return next;
    });
  }

  const decided = choices.filter(Boolean).length;

  async function handleUseDisk(): Promise<void> {
    await useTabsStore.getState().reloadFromDisk(view!.path, view!.diskContent);
    close();
  }

  async function handleKeepMine(): Promise<void> {
    await useTabsStore.getState().saveTab(view!.tabId);
    close();
  }

  /** 应用逐段取舍：合并内容写回编辑器并落盘（含新磁盘基线）。 */
  async function handleApplyMerged(): Promise<void> {
    const merged = buildMergedLines(diff, hunks, choices).join("\n");
    const store = useTabsStore.getState();
    store.updateContent(view!.tabId, merged);
    await store.saveTab(view!.tabId);
    close();
  }

  function handleCancel(): void {
    close();
  }

  // 一次性铺平渲染段：未取舍块先输出操作条再输出左右对照行；
  // 已取舍块在块首位置输出合并行（横跨两栏），块内其余行不再渲染。
  const segments: Segment[] = [];
  rows.forEach((row, i) => {
    const hi = hunkByRow[i];
    const choice = hi !== null ? choices[hi] ?? null : null;
    if (hi !== null && i === hunks[hi].rowStart) {
      if (!choice) {
        segments.push({ type: "bar", hi });
      } else {
        const texts = choice === "disk" ? hunks[hi].diskRows : hunks[hi].memoryRows;
        if (texts.length === 0) {
          // 纯新增段采用磁盘 / 纯删除段保留我的 → 该段不保留任何行。
          segments.push({ type: "resolved", hi, choice, text: "", k: 0, empty: true });
        } else {
          texts.forEach((text, k) =>
            segments.push({ type: "resolved", hi, choice, text, k, empty: false }),
          );
        }
      }
    }
    if (!choice) segments.push({ type: "row", row, i });
  });

  return (
    <div className="conflict-overlay" role="dialog" aria-modal="true" aria-label="文件内容差异">
      <div className="conflict-page">
        <div className="conflict-head">
          <Icon name="AlertTriangle" size={18} />
          <span className="conflict-title">文件内容差异：{view.name}</span>
          <span className="conflict-path" title={view.path}>
            {view.path}
          </span>
          <span className="conflict-stat">
            <span className="diff-stat-ins">+{added}</span>
            <span className="diff-stat-del">−{removed}</span>
          </span>
        </div>
        <p className="conflict-hint">
          磁盘版本（左）与当前编辑内容（右）不一致。可点击差异段上方的箭头逐段取舍
          （← 用磁盘内容覆盖、→ 保留我的内容），再「应用合并结果」；也可整体采用某一侧。
        </p>
        <div className="conflict-diff">
          <div className="conflict-col-head">
            <span>磁盘版本（只读）</span>
            <span>当前编辑内容（只读）</span>
          </div>
          <div className="conflict-pre scroll-thin">
            {segments.map((seg) => {
              if (seg.type === "bar") {
                return (
                  <div key={`bar${seg.hi}`} className="diff-hunk-bar">
                    <button
                      type="button"
                      className="diff-hunk-btn"
                      title="该段差异使用磁盘内容覆盖"
                      onClick={() => resolveHunk(seg.hi, "disk")}
                    >
                      <Icon name="ChevronLeft" size={12} />
                      用磁盘内容覆盖此段
                    </button>
                    <button
                      type="button"
                      className="diff-hunk-btn"
                      title="该段差异保留当前编辑内容"
                      onClick={() => resolveHunk(seg.hi, "mine")}
                    >
                      保留我的此段内容
                      <Icon name="ChevronRight" size={12} />
                    </button>
                  </div>
                );
              }
              if (seg.type === "resolved") {
                return (
                  <div key={`res${seg.hi}-${seg.k}`} className="diff-grid-row">
                    <div
                      className="diff-row diff-resolved"
                      title="点击撤销该段取舍"
                      onClick={() => resolveHunk(seg.hi, seg.choice)}
                    >
                      <Icon name="Check" size={12} />
                      {seg.empty ? "（已取舍：该段不保留任何行）" : seg.text}
                    </div>
                  </div>
                );
              }
              const row = seg.row;
              return (
                <div key={`r${seg.i}`} className="diff-grid-row">
                  <div className={leftRowClass(row)}>
                    <span className="diff-ln">{row.leftNo}</span>
                    {row.left ?? ""}
                  </div>
                  <div className={rightRowClass(row)}>
                    <span className="diff-ln">{row.rightNo}</span>
                    {row.right ?? ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="conflict-actions">
          {decided > 0 && (
            <button
              type="button"
              className="unsaved-btn primary"
              onClick={() => void handleApplyMerged()}
            >
              应用合并结果（已取舍 {decided}/{hunks.length} 段）
            </button>
          )}
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
