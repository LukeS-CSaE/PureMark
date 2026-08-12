/**
 * Unit tests for `src/lib/fileTree.ts`.
 *
 * NOTE ON SCOPE: the tree *construction* (hidden-file skipping, .md/.markdown
 * filtering, "keep a directory only if it contains Markdown", directories-first
 * ordering and `depth`) lives in Rust (`src-tauri/src/main.rs::build_node`) and
 * cannot be executed in this sandbox (no Rust toolchain). The tests below
 * therefore:
 *   - fully cover the TypeScript helpers, and
 *   - use a fixture that mirrors the Rust contract to verify the frontend
 *     consumes an ordered/depth-annotated tree correctly.
 */
import { describe, expect, it } from "vitest";
import { findNodeByPath, flattenTree, isMarkdownName } from "../lib/fileTree";
import type { FileNode } from "../types";

// ---------------------------------------------------------------------------
// isMarkdownName
// ---------------------------------------------------------------------------

describe("isMarkdownName", () => {
  it.each(["a.md", "a.markdown", "README.MD", "Notes.MarkDown", "复杂 名称.md"])(
    "accepts %s",
    (name) => {
      expect(isMarkdownName(name)).toBe(true);
    },
  );

  it.each(["a.txt", "a.mdx", "md", "markdown", "a.md.bak", "a.html", ""])(
    "rejects %s",
    (name) => {
      expect(isMarkdownName(name)).toBe(false);
    },
  );

  it("is case-insensitive", () => {
    expect(isMarkdownName("X.Md")).toBe(isMarkdownName("x.md"));
  });
});

// ---------------------------------------------------------------------------
// Fixture mirroring the Rust `build_tree` contract
// ---------------------------------------------------------------------------

const file = (name: string, path: string, depth: number): FileNode => ({
  id: path,
  name,
  path,
  isDir: false,
  depth,
});

const dir = (name: string, path: string, depth: number, children: FileNode[]): FileNode => ({
  id: path,
  name,
  path,
  isDir: true,
  children,
  depth,
});

/**
 * /root
 *   docs/            (depth 0)
 *     guide/         (depth 1)
 *       intro.md     (depth 2)
 *     api.md         (depth 1)
 *   README.md        (depth 0)
 *   zeta.md          (depth 0)
 */
const tree: FileNode[] = [
  dir("docs", "/root/docs", 0, [
    dir("guide", "/root/docs/guide", 1, [file("intro.md", "/root/docs/guide/intro.md", 2)]),
    file("api.md", "/root/docs/api.md", 1),
  ]),
  file("README.md", "/root/README.md", 0),
  file("zeta.md", "/root/zeta.md", 0),
];

// ---------------------------------------------------------------------------
// flattenTree
// ---------------------------------------------------------------------------

describe("flattenTree", () => {
  it("returns an empty array for an empty tree", () => {
    expect(flattenTree([])).toEqual([]);
  });

  it("walks depth-first, parent before children", () => {
    expect(flattenTree(tree).map((n) => n.name)).toEqual([
      "docs",
      "guide",
      "intro.md",
      "api.md",
      "README.md",
      "zeta.md",
    ]);
  });

  it("includes every node exactly once", () => {
    const flat = flattenTree(tree);
    expect(flat).toHaveLength(6);
    expect(new Set(flat.map((n) => n.path)).size).toBe(6);
  });

  it("preserves the directories-before-files order of each sibling group", () => {
    const rootLevel = flattenTree(tree).filter((n) => n.depth === 0);
    expect(rootLevel.map((n) => n.isDir)).toEqual([true, false, false]);
  });

  it("preserves depth so the UI can indent correctly", () => {
    const byName = new Map(flattenTree(tree).map((n) => [n.name, n.depth]));
    expect(byName.get("docs")).toBe(0);
    expect(byName.get("guide")).toBe(1);
    expect(byName.get("intro.md")).toBe(2);
    expect(byName.get("api.md")).toBe(1);
    expect(byName.get("README.md")).toBe(0);
  });

  it("handles a directory with an empty children array", () => {
    const nodes: FileNode[] = [dir("empty", "/root/empty", 0, [])];
    expect(flattenTree(nodes).map((n) => n.name)).toEqual(["empty"]);
  });

  it("handles a node without a children property", () => {
    const nodes: FileNode[] = [file("solo.md", "/solo.md", 0)];
    expect(flattenTree(nodes)).toHaveLength(1);
  });

  it("does not mutate the input", () => {
    const snapshot = JSON.stringify(tree);
    flattenTree(tree);
    expect(JSON.stringify(tree)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// findNodeByPath
// ---------------------------------------------------------------------------

describe("findNodeByPath", () => {
  it("finds a top-level file", () => {
    expect(findNodeByPath(tree, "/root/README.md")?.name).toBe("README.md");
  });

  it("finds a top-level directory", () => {
    const node = findNodeByPath(tree, "/root/docs");
    expect(node?.isDir).toBe(true);
    expect(node?.children).toHaveLength(2);
  });

  it("finds a deeply nested file", () => {
    const node = findNodeByPath(tree, "/root/docs/guide/intro.md");
    expect(node?.name).toBe("intro.md");
    expect(node?.depth).toBe(2);
  });

  it("returns null for an unknown path", () => {
    expect(findNodeByPath(tree, "/root/missing.md")).toBeNull();
  });

  it("returns null for an empty tree", () => {
    expect(findNodeByPath([], "/anything")).toBeNull();
  });

  it("matches exactly (no prefix matching)", () => {
    expect(findNodeByPath(tree, "/root/doc")).toBeNull();
    expect(findNodeByPath(tree, "/root/README")).toBeNull();
  });

  it("returns the identical object reference from the tree", () => {
    expect(findNodeByPath(tree, "/root/zeta.md")).toBe(tree[2]);
  });
});
