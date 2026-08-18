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
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { searchHighlight } from "./searchHighlight";
import { lowlight } from "../lowlight";

export function buildEditorExtensions() {
  const extensions = [
    // 关闭内置 codeBlock，改用 CodeBlockLowlight（同名节点，schema 不变）。
    StarterKit.configure({ codeBlock: false }),
    // html: true —— 用户文档表格单元格内普遍用 `<br>` 换行、`<ul>/<li>` 嵌列表
    // （GFM 表格无法承载块级内容时的通用写法）。html: false 会把这些内联 HTML
    // 转义成字面文本，导致「表格中嵌入列表等文本不会正确显示」。
    // 开启后 `<br>` 解析为 hardBreak、`<ul>` 解析为真实列表节点；序列化回写由
    // markdownSerializer.ts 的表格单元格逻辑负责（<br> 拼接 + 列表前缀）。
    Markdown.configure({ html: true, transformPastedText: true, transformCopiedText: true }),
    Link.configure({ openOnClick: false }),
    Image,
    // 空文档时显示占位提示（.pm-editor .is-empty::before 消费 data-placeholder）。
    Placeholder.configure({ placeholder: "···" }),
    TaskList,
    TaskItem.configure({ nested: true }),
    // 代码块语法高亮：lowlight 产出 .hljs-* decoration 类，配色由
    // highlight.css 的 --hl-* 令牌驱动（与 CM6 .cm-tok-* 同调色板）。
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: "plaintext" }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    // 搜索跳转高亮（live/preview 共用；用 decoration 而非 DOM 包裹，避免被 PM 撤销）。
    searchHighlight,
  ];
  return extensions;
}
