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
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
  },
});
