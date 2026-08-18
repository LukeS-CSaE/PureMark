/**
 * 通用错误边界（修复 PureMark 整窗白屏的根因之一）。
 *
 * 设计意图（需求 A）：
 * 任何被包裹子树的「渲染期或 effect 期」异常都会被捕获，转而渲染一个
 * **可恢复**的错误面板（错误信息 + 重新加载按钮），而不是让整棵 React 树
 * 卸载、造成整窗空白。这是 ErrorBoundary 相对散落 try/catch 的关键价值：
 * 即便仍有潜在崩溃，用户只会看到错误面板且 console 有真实堆栈，便于后续
 * 精确定位。
 *
 * 用法：
 *  - <ErrorBoundary><App /></ErrorBoundary> 包裹顶层，消灭整窗空白症状；
 *  - 也可作为通用边界包裹单个 pane（如 preview 窗格），fallback 传 null/占位。
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** 可选自定义 fallback；不传则渲染内置「可恢复错误面板」。 */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  /** 把抛出的异常写入 state，触发 fallback 渲染（不冒泡、不卸载整树）。 */
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  /** 打印真实 error 与组件栈到 console，保留现场供精确定位。 */
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary] 捕获到子树异常：", error);
    if (info && info.componentStack) {
      console.error("[ErrorBoundary] 异常组件栈：\n" + info.componentStack);
    }
  }

  /**
   * 「重新加载」按钮：优先调用应用自注册的 `window.__pmReset`（若存在），
   * 否则退化为整窗刷新。任一步骤都安全，绝不抛错到外层。
   */
  private handleReload = (): void => {
    try {
      const pmReset = (window as unknown as { __pmReset?: () => void }).__pmReset;
      if (typeof pmReset === "function") {
        pmReset();
        return;
      }
    } catch {
      /* __pmReset 抛错则退化为整窗刷新 */
    }
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    // 允许调用方传入自定义 fallback（如单个 pane 崩溃时直接返回 null）。
    if (this.props.fallback !== undefined) return this.props.fallback;

    const message = this.state.error?.message ?? "未知错误";
    return (
      <div
        role="alert"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          padding: "24px",
          boxSizing: "border-box",
          background: "#0f1115",
          color: "#e6e6e6",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: "560px",
            width: "100%",
            border: "1px solid #3a3f4b",
            borderRadius: "10px",
            padding: "24px 28px",
            background: "#171a21",
          }}
        >
          <h2 style={{ margin: "0 0 12px", fontSize: "18px", fontWeight: 600 }}>
            页面出现错误
          </h2>
          <p style={{ margin: "0 0 16px", fontSize: "13px", lineHeight: 1.6, color: "#aab1bd" }}>
            渲染过程中发生异常，已阻止其扩散到整个窗口。您可尝试重新加载页面以恢复。
          </p>
          <pre
            style={{
              margin: "0 0 18px",
              padding: "12px",
              maxHeight: "180px",
              overflow: "auto",
              borderRadius: "6px",
              background: "#0c0e13",
              color: "#ff9b9b",
              fontSize: "12px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {message}
          </pre>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: "8px 18px",
              borderRadius: "6px",
              border: "none",
              background: "#3b82f6",
              color: "#fff",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }
}
