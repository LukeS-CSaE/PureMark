/**
 * live 视图（TipTap）的编辑器扩展集合，抽成独立模块以便单测用
 * `getSchema(buildEditorExtensions())` 验证 schema（无需 DOM）。
 *
 * GFM 表格依赖 `@tiptap/extension-table` 全家桶（Table / TableRow /
 * TableHeader / TableCell）。自 2.27 起这四者为独立包，已安装并注册，
 * schema 可解析 `tableRow+`，tiptap-markdown 会自动接管 markdown↔PM 表格互转。
 */
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { searchHighlight } from "./searchHighlight";

export function buildEditorExtensions() {
  const extensions = [
    StarterKit,
    Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
    Link.configure({ openOnClick: false }),
    Image,
    // 空文档时显示占位提示（.pm-editor .is-empty::before 消费 data-placeholder）。
    Placeholder.configure({ placeholder: "type here" }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    // 搜索跳转高亮（live/preview 共用；用 decoration 而非 DOM 包裹，避免被 PM 撤销）。
    searchHighlight,
  ];
  return extensions;
}
