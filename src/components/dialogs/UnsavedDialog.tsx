/**
 * 自定义未保存 / 刷新确认弹窗（设计 §2 / T02）。
 *
 * 替代原先原生 `ask` 两按钮，升级为真实 React 组件，提供 promise 化 API：
 *  - `confirmClose(conflict, names)`  → Promise<CloseDecision>
 *  - `confirmRefresh(names)`          → Promise<RefreshDecision>
 *  - `confirmUnsaved(name)`           → Promise<boolean>（向后兼容旧调用）
 *
 * 三态渲染：
 *  - 关闭： [保存][不保存][查看冲突?][取消]
 *  - 刷新： [保存并刷新][不保存][取消]
 *
 * 组件本身在 `AppShell` 顶层挂载，通过 `useUIStore.unsaved` 驱动渲染；
 * 守卫逻辑 `await` 该 promise 后继续 destroy / 关闭标签 / 保持。
 */
import { useUIStore } from "../../store/useUIStore";
import type { CloseDecision, RefreshDecision } from "../../types";
import Icon from "../ui/Icon";

/** 模块级 resolver：弹窗按钮点击后兑现对应 promise。 */
let resolver: ((value: CloseDecision | RefreshDecision) => void) | null = null;

function settle(value: CloseDecision | RefreshDecision): void {
  const r = resolver;
  resolver = null;
  useUIStore.getState().closeUnsaved();
  if (r) r(value);
}

/** 窗口 / 标签关闭确认（三态 + 冲突时「查看冲突」）。返回用户决策。 */
export function confirmClose(conflict: boolean, names: string[] = []): Promise<CloseDecision> {
  useUIStore.getState().openUnsaved({ mode: "close", conflict, names });
  return new Promise<CloseDecision>((resolve) => {
    resolver = resolve as (value: CloseDecision | RefreshDecision) => void;
  });
}

/** 刷新确认（保存并刷新 / 不保存 / 取消）。 */
export function confirmRefresh(names: string[] = []): Promise<RefreshDecision> {
  useUIStore.getState().openUnsaved({ mode: "refresh", conflict: false, names });
  return new Promise<RefreshDecision>((resolve) => {
    resolver = resolve as (value: CloseDecision | RefreshDecision) => void;
  });
}

/** 向后兼容：旧的两按钮「确认丢弃」语义。 */
export function confirmUnsaved(name: string): Promise<boolean> {
  return confirmClose(false, [name]).then((d) => d === "save" || d === "discard");
}

/** 弹窗 UI（受 useUIStore.unsaved 控制，无状态时不渲染）。 */
export default function UnsavedDialog() {
  const unsaved = useUIStore((s) => s.unsaved);
  if (!unsaved) return null;

  const isClose = unsaved.mode === "close";
  const title = isClose ? "未保存的修改" : "刷新未保存的修改";
  const namesText = unsaved.names.length ? unsaved.names.join("、") : "当前文档";

  return (
    <div className="unsaved-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="unsaved-card">
        <div className="unsaved-title">
          <Icon name="AlertTriangle" size={18} />
          <span>{title}</span>
        </div>
        <p className="unsaved-body">
          {isClose
            ? `「${namesText}」有未保存的修改，确定要关闭吗？`
            : `「${namesText}」有未保存的修改，刷新将用磁盘内容覆盖内存中的修改。`}
        </p>
        <div className="unsaved-actions">
          {isClose ? (
            <button type="button" className="unsaved-btn primary" onClick={() => settle("save")}>
              保存
            </button>
          ) : (
            <button type="button" className="unsaved-btn primary" onClick={() => settle("saveReload")}>
              保存并刷新
            </button>
          )}
          <button
            type="button"
            className="unsaved-btn"
            onClick={() => settle(isClose ? "discard" : "discardReload")}
          >
            不保存
          </button>
          {unsaved.conflict && (
            <button type="button" className="unsaved-btn" onClick={() => settle("viewConflict")}>
              查看冲突
            </button>
          )}
          <button
            type="button"
            className="unsaved-btn subtle"
            onClick={() => settle(isClose ? "cancel" : "cancel")}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
