import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Tauri expects a fixed dev port and ignores the src-tauri directory.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  // A-2: CodeMirror 6 breaks hard (duplicate state/view instances silently fail
  // to talk to each other) if more than one copy ends up in the bundle. The
  // @codemirror/lang-* packages declare these as peer deps, so pin them to a
  // single physical module.
  resolve: {
    dedupe: [
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/language",
      "@lezer/common",
    ],
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // dev-only 修复：用户在外部编辑器（如 VS Code）保存项目根目录内的 .md 等文档时，
      // Vite 默认会 watch 整个项目目录并因该文件不在 import 模块图中而触发整页 full reload
      // （表现为 WebView 白屏、DevTools console 被清空、内存 tab 丢失）。
      // 将这些用户数据文档扩展名加入忽略列表后，Vite 不再因外部文档保存而 reload；
      // 方案 B 的 fileWatcher（基于 @tauri-apps/plugin-fs）仍会正确捕获外部改动并走 in-app 流程，
      // 完全不依赖页面 reload。生产构建（tauri build）走 rollup 打包，不读取 server.watch，故不受影响。
      ignored: ["**/src-tauri/**", "**/*.{md,markdown,mdx,txt,text}"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
  },
});
