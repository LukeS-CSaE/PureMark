import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import "./styles/theme.css";
import "./styles/layout.css";
// Must come after Tailwind's preflight (pulled in by theme.css) so the
// `.cm-*` rules are not reset — design §1.7.
import "./styles/live.css";
// Must load AFTER live.css: preview.css hosts the single source of truth for
// `.cm-md-*` typography via grouped `.preview-content h2, .cm-live .cm-md-h2`
// selectors, which must override live.css's simpler same-name rules — design §8.4.
import "./styles/preview.css";
// Search panel styles (T02). Loaded last; the `.search-*` rules are scoped and
// independent of the layout/preview chain above.
import "./styles/search.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
