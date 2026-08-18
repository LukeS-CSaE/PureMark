import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";

import "./styles/theme.css";
import "./styles/layout.css";
// Must come after Tailwind's preflight (pulled in by theme.css) so the
// `.cm-*` rules are not reset — design §1.7.
import "./styles/live.css";
// 代码块语法高亮（.hljs-* → --hl-* 令牌），需晚于 theme.css 的令牌定义。
import "./styles/highlight.css";
// Search panel styles (T02). Loaded last; the `.search-*` rules are scoped and
// independent of the layout/preview chain above.
import "./styles/search.css";
// 需求1：确认弹窗 / 冲突解决页 / 外部改动提示条样式
import "./styles/dialogs.css";
// 需求2：自定义右键菜单样式
import "./styles/contextMenu.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* 顶层错误边界：捕获任意子树渲染/effect 异常，阻止整窗白屏（需求 A）。 */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
