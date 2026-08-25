/**
 * 本地图片路径解析：把 markdown 图片 src（多为相对路径）解析为
 * Tauri WebView 可加载的 asset 协议 URL。
 *
 * 背景：TipTap Image 节点存的是相对路径（如 `assets/xxx.png`），直接放进
 * `<img src>` 会被 WebView 解析成相对 origin 的 URL（如
 * `http://localhost:1420/assets/xxx.png`）而 404。渲染时需用文档所在目录
 * 拼出绝对路径，再经 `convertFileSrc` 转成 `asset://localhost/...` 才能加载
 * 本地图片。在线图片（`https://...`）是绝对 URL，浏览器直接加载，无需转换。
 *
 * 本模块只负责「路径判定 + 拼接」，`convertFileSrc`（依赖 Tauri 运行时）
 * 作为 `toAssetUrl` 参数注入，便于在无 Tauri 的单测环境用 mock 验证。
 */
import { joinPath } from "../pathUtils";

/** 绝对 URL 协议前缀：原样放行，不转 asset URL。 */
const ABSOLUTE_URL_RE = /^(https?:|data:|blob:|asset:|tauri:|file:)/i;
/** 绝对本地文件路径：Windows 盘符（`C:\`）或 Unix 根（`/`）。 */
const ABSOLUTE_FILE_RE = /^([a-zA-Z]:[\\/]|[\\/])/;

/**
 * 把图片 src 解析为 WebView 可加载的 URL。
 *
 * - 空 / 绝对 URL（http/https/data/...）→ 原样返回
 * - 绝对本地文件路径 → 直接经 `toAssetUrl` 转换（不拼 documentDir）
 * - 相对路径 + documentDir 非空 → 拼绝对路径后转换；路径分隔符统一为正斜杠
 *   （asset 协议路径用正斜杠，Windows 反斜杠需归一化）
 * - 相对路径但 documentDir 为空（未保存文档）→ 原样返回（无法解析，交给浏览器降级）
 *
 * @param toAssetUrl 本地绝对路径 → WebView asset URL（如 Tauri `convertFileSrc`）
 */
export function resolveImageSrc(
  src: string,
  documentDir: string,
  toAssetUrl: (absPath: string) => string,
): string {
  if (!src) return src;
  if (ABSOLUTE_URL_RE.test(src)) return src;
  if (ABSOLUTE_FILE_RE.test(src)) {
    return toAssetUrl(src.replace(/\\/g, "/"));
  }
  if (!documentDir) return src;
  const absPath = joinPath(documentDir, src).replace(/\\/g, "/");
  return toAssetUrl(absPath);
}
