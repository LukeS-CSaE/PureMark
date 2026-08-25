import { useMemo, useState, type MouseEvent } from "react";
import { useUIStore } from "../../store/useUIStore";
import { useTabsStore } from "../../store/useTabsStore";
import { useConfigStore } from "../../store/useConfigStore";
import { readFileTextWithEncoding } from "../../commands/fsCommands";
import { openInFocusedPane } from "../../lib/paneRouter";
import { buildFileMenu } from "../../lib/fileContextMenu";
import { sortFileNodes } from "../../lib/fileSort";
import type { FileNode } from "../../types";
import Icon from "../ui/Icon";

/** Recursive, collapsible Markdown file tree. */
export default function FileTree() {
  const tree = useUIStore((s) => s.tree);
  const activePath = useTabsStore(
    (s) => s.tabs.find((t) => t.id === s.activeId)?.path ?? "",
  );
  const sortOrder = useConfigStore((s) => s.config.fileSortOrder);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // 按当前排序方式对文件树进行排序（目录始终在文件之前）
  const sortedTree = useMemo(() => sortFileNodes(tree, sortOrder), [tree, sortOrder]);

  async function handleOpenFile(node: FileNode) {
    // 编码自动检测（UTF-8 / GBK / GB2312 / Big5 / UTF-16），保存时按原编码写回。
    const { content, encoding, hadBom } = await readFileTextWithEncoding(node.path);
    openInFocusedPane({ path: node.path, name: node.name, content, encoding, hadBom });
  }

  function toggleDir(id: string) {
    setExpanded((m) => ({ ...m, [id]: !m[id] }));
  }

  // 需求2：文件树节点右键 → 自定义菜单（写操作经 fileOps 真实调用 Rust 命令）
  function onNodeContextMenu(e: MouseEvent, node: FileNode): void {
    e.preventDefault();
    e.stopPropagation();
    useUIStore.getState().openContextMenu({
      x: e.clientX,
      y: e.clientY,
      scope: "file",
      items: buildFileMenu(node),
      payload: { path: node.path, isDir: node.isDir },
    });
  }

  if (sortedTree.length === 0) {
    return (
      <div className="px-2 py-3 text-[12px] text-foreground-subtle">
        
      </div>
    );
  }

  const renderNodes = (nodes: FileNode[]): React.ReactNode =>
    nodes.map((node) => {
      const isOpen = expanded[node.id] ?? true;
      if (node.isDir) {
        return (
          <div key={node.id}>
            <div
              className="file-item"
              style={{ paddingLeft: 0 + node.depth * 14 }}
              onClick={() => toggleDir(node.id)}
              onContextMenu={(e) => onNodeContextMenu(e, node)}
            >
              <Icon name={isOpen ? "ChevronDown" : "ChevronRight"} size={14} />
              <span className="flex-1 truncate text-[13px]">{node.name}</span>
            </div>
            {isOpen && node.children ? (
              <div>{renderNodes(sortFileNodes(node.children, sortOrder))}</div>
            ) : null}
          </div>
        );
      }
      const active = node.path === activePath;
      return (
        <div
          key={node.id}
          className={`file-item${active ? " active" : ""}`}
          style={{ paddingLeft: 10 + node.depth * 14 + 16 }}
          onClick={() => void handleOpenFile(node)}
          onContextMenu={(e) => onNodeContextMenu(e, node)}
        >
          <Icon name="FileText" size={15} />
          <span className="flex-1 truncate text-[13px]">{node.name}</span>
        </div>
      );
    });

  return <div className="file-tree">{renderNodes(sortedTree)}</div>;
}
