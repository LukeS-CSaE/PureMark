/**
 * Frontend helpers for working with the FileNode tree returned by the Rust
 * `build_tree` command. The primary tree construction happens on the Rust side;
 * these utilities cover lookups and flattening for the UI.
 */
import type { FileNode } from "../types";

/** True when a file name looks like a Markdown document. */
export function isMarkdownName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

/** Flatten the tree (depth-first) into a single ordered list. */
export function flattenTree(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  const walk = (list: FileNode[]): void => {
    for (const node of list) {
      out.push(node);
      if (node.children && node.children.length > 0) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/** Find a node by its absolute path. */
export function findNodeByPath(nodes: FileNode[], path: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children && node.children.length > 0) {
      const found = findNodeByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}
