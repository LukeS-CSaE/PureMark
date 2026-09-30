/**
 * 文件树排序工具函数（纯函数）。
 *
 * 排序规则：目录始终排在文件之前，各组内部按选定排序方式排列。
 * 递归排序子目录的 children。
 */
import type { FileNode, FileSortOrder } from "../types";

/** 提取文件扩展名（小写），无扩展名返回空字符串。 */
function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

/** 按名称升序比较（大小写不敏感）。 */
function cmpNameAsc(a: string, b: string): number {
  return a.toLowerCase().localeCompare(b.toLowerCase());
}

/** 按名称降序比较（大小写不敏感）。 */
function cmpNameDesc(a: string, b: string): number {
  return b.toLowerCase().localeCompare(a.toLowerCase());
}

/**
 * 对一组 FileNode 按指定排序方式排序（不修改原数组）。
 * 目录始终在文件之前；各组内部按排序方式排列。
 */
export function sortFileNodes(nodes: FileNode[], order: FileSortOrder): FileNode[] {
  if (nodes.length <= 1) return nodes;

  const dirs: FileNode[] = [];
  const files: FileNode[] = [];
  for (const node of nodes) {
    if (node.isDir) dirs.push(node);
    else files.push(node);
  }

  const comparator = buildComparator(order);
  dirs.sort((a, b) => comparator(a, b));
  files.sort((a, b) => comparator(a, b));

  return [...dirs, ...files];
}

/** 根据排序方式构造比较函数。 */
function buildComparator(order: FileSortOrder): (a: FileNode, b: FileNode) => number {
  switch (order) {
    case "name-asc":
      return (a, b) => cmpNameAsc(a.name, b.name);
    case "name-desc":
      return (a, b) => cmpNameDesc(a.name, b.name);
    case "type":
      return (a, b) => {
        const extCmp = extOf(a.name).localeCompare(extOf(b.name));
        if (extCmp !== 0) return extCmp;
        // 同扩展名内按名称升序
        return cmpNameAsc(a.name, b.name);
      };
    case "modified-desc":
      // 最近修改在前；mtime 相同时按名称升序兜底
      return (a, b) => {
        const diff = (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0);
        return diff !== 0 ? diff : cmpNameAsc(a.name, b.name);
      };
    case "modified-asc":
      // 最早修改在前；mtime 相同时按名称升序兜底
      return (a, b) => {
        const diff = (a.mtimeMs ?? 0) - (b.mtimeMs ?? 0);
        return diff !== 0 ? diff : cmpNameAsc(a.name, b.name);
      };
    default:
      return (a, b) => cmpNameAsc(a.name, b.name);
  }
}
