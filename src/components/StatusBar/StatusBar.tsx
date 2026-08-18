import { useTabsStore } from "../../store/useTabsStore";
import { useEditorStats } from "../../hooks/useEditorStats";

/** 编码标签 → 状态栏显示名（gb18030 兼容 GBK/GB2312，统一显示为 GBK）。 */
function encodingLabel(encoding: string | undefined, hadBom: boolean | undefined): string {
  const base =
    encoding === "gb18030" || encoding === "gbk" || encoding === "gb2312"
      ? "GBK"
      : encoding === "big5"
        ? "Big5"
        : encoding === "utf-16le"
          ? "UTF-16 LE"
          : encoding === "utf-16be"
            ? "UTF-16 BE"
            : "UTF-8";
  return hadBom && (base === "UTF-8" || base.startsWith("UTF-16")) ? `${base} with BOM` : base;
}

/** 34px status bar: cursor position + document stats + 当前文档编码。 */
export default function StatusBar() {
  const active = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeId) ?? null);
  const stats = useEditorStats(
    active?.content ?? "",
    active?.cursor ?? { line: 1, col: 1 },
  );

  return (
    <footer className="app-statusbar">
      <div className="status-item">
        <span>{stats.lines} Ln </span>
        <span>{stats.words} words</span>
        <span>{stats.chars} charts</span>
      </div>

      {/* 右侧：当前文档的编码（非 UTF-8 中文文档自动检测得出）+ 类型。 */}
      <div className="status-item">
        <span>{encodingLabel(active?.encoding, active?.hadBom)}</span>
        <span>Markdown</span>
      </div>
    </footer>
  );
}
