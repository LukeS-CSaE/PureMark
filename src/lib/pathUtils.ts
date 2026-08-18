/**
 * Cross-platform path helpers for the app layer (pure, no Tauri dependency).
 */

/**
 * Return the parent directory of an absolute file path, preserving the
 * separator style of the input. Returns the input unchanged when it carries no
 * directory component (e.g. a bare `file.md`).
 */
export function dirOf(filePath: string): string {
  const sep = filePath.includes("\\") ? "\\" : "/";
  const norm = filePath.replace(/[\\/]+/g, sep);
  const idx = norm.lastIndexOf(sep);
  if (idx < 0) return filePath;
  const parent = norm.slice(0, idx);
  return parent || filePath;
}

/**
 * 将目录与名称拼接为完整路径，保留输入的路径分隔符风格。
 * 空目录返回名称本身。
 */
export function joinPath(dir: string, name: string): string {
  if (!dir) return name;
  const sep = dir.includes("\\") ? "\\" : "/";
  const norm = dir.replace(/[\\/]+$/g, "");
  return `${norm}${sep}${name}`;
}
