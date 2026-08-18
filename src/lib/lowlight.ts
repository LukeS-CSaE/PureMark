/**
 * lowlight 实例，供 TipTap `CodeBlockLowlight` 做代码块语法高亮。
 *
 * 语言集来自 `highlight.ts` 的 `hljsLanguages`（仅注册 markdown 写作常用语言，
 * 控制打包体积，见系统设计 §1.6），别名（js / ts / html / sh / py 等）由
 * lowlight 从语言定义中自动注册。配色不走 hljs 自带主题：lowlight 只产出
 * `.hljs-*` 类，颜色统一由 `src/styles/highlight.css` 从 `--hl-*` 令牌取值，
 * 与 CM6 的 `.cm-tok-*` 共用同一调色板（theme.css），light/dark 切换零成本。
 */
import { createLowlight } from "lowlight";
import { hljsLanguages } from "./highlight";

export const lowlight = createLowlight(hljsLanguages);
