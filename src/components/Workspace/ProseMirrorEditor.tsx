/**
 * ProseMirror / TipTap 驱动的 `live` 视图（Phase 1）。
 *
 * 设计要点：
 *  - live 视图由 EditorCard 无条件挂载（已全量替换 CM6 live）；仅 preview/edit 走其他路径。
 *  - 渲染即所见即所得（Typora 风格零可见语法），靠 TipTap schema + Markdown 扩展。
 *  - 写回使用「源码保留型序列化器」：未改动块字节原样回写，改动块重序列化 → 字节级一致。
 *  - 通过 editorRegistry 注册 EditorHandle，并接 ② 写回 / ③ 回填 两路同步，使保存、
 *    脏标记、同文件分屏与 CM6 路径保持一致。① peer 转发在 Phase 2 细化（P1 用 ③ 传播）。
 *
 * 已知 P1 限制：getCursor / scrollToOffset 为近似实现，TOC 在 PM live 窗格的精确跳转
 * 归 Phase 2（需 PM 位置 ↔ markdown 偏移映射）。
 */
import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import type { MarkdownSerializer } from "prosemirror-markdown";
import { useTabsStore } from "../../store/useTabsStore";
import { registerEditor, unregisterEditor, type EditorHandle } from "../../lib/editorRegistry";
import { buildMarkdownSerializer, serializeNodeToMarkdown } from "../../lib/prosemirror/markdownSerializer";
import { serializeSourcePreserving } from "../../lib/prosemirror/sourcePreserving";
import type { PaneId } from "../../types";
import "../../styles/pm.css";

interface Props {
  paneId: PaneId;
  tabId: string | null;
  viewMode: "live" | "edit";
}

/** 把当前 PM 文档序列化为 markdown（源码保留；失配时退化为整文档默认序列化）。 */
function serializeCurrent(
  editor: Editor,
  originalDoc: PMNode | null,
  original: string,
  serializer: MarkdownSerializer | null,
): string {
  const fallback = (): string => {
    const md = (editor.storage as Record<string, any>).markdown;
    return md && typeof md.getMarkdown === "function" ? md.getMarkdown() : "";
  };
  if (!serializer || !originalDoc) return fallback();
  const result = serializeSourcePreserving(
    editor.state.doc,
    originalDoc,
    original,
    (node) => serializeNodeToMarkdown(node, serializer),
  );
  return result.matched ? result.markdown : fallback();
}

export default function ProseMirrorEditor({ paneId, tabId, viewMode }: Props) {
  // 字节保真基准：本编辑器实例最初加载的 markdown 与其解析后的 PM 文档。
  const originalRef = useRef<string>("");
  const originalDocRef = useRef<PMNode | null>(null);
  const currentTabRef = useRef<string | null>(null);
  const serializerRef = useRef<MarkdownSerializer | null>(null);
  const lastWrittenRef = useRef<string | null>(null);

  if (tabId && currentTabRef.current !== tabId) {
    currentTabRef.current = tabId;
    const tab = useTabsStore.getState().tabs.find((t) => t.id === tabId);
    originalRef.current = tab ? tab.content : "";
    originalDocRef.current = null; // 需按新 tab 重新捕获保真基准
    serializerRef.current = null;
    lastWrittenRef.current = null;
  }

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
        Link.configure({ openOnClick: false }),
        Image,
        Placeholder.configure({ placeholder: "打开或新建Markdown文档" }),
        TaskList,
        TaskItem.configure({ nested: true }),
      ],
      content: originalRef.current || "",
      editable: viewMode === "live" || viewMode === "edit",
      editorProps: { attributes: { class: "pm-editor" } },
      onUpdate: ({ editor }) => {
        if (!tabId) return;
        const md = serializeCurrent(editor, originalDocRef.current, originalRef.current, serializerRef.current);
        lastWrittenRef.current = md;
        useTabsStore.getState().updateContent(tabId, md);
      },
    },
    [tabId],
  );

  // serializer 在 schema 就绪后构建一次；同时捕获最初解析出的 PM 文档作为保真基准。
  useEffect(() => {
    if (editor && !serializerRef.current) {
      serializerRef.current = buildMarkdownSerializer(editor.schema);
    }
    if (editor && !originalDocRef.current) {
      // 编辑器加载 `content` 时已把 markdown 解析为 PM 文档；从此刻起冻结该基准。
      originalDocRef.current = editor.state.doc;
    }
  }, [editor]);

  // 注册 EditorHandle（getValue 走源码保留序列化，保证保存字节级一致）。
  useEffect(() => {
    if (!editor || !tabId) return;
    const handle: EditorHandle = {
      paneId,
      tabId,
      getValue() {
        return serializeCurrent(editor, originalDocRef.current, originalRef.current, serializerRef.current);
      },
      getSelection() {
        const { from, to } = editor.state.selection;
        return { start: from, end: to };
      },
      setSelection(start, end) {
        editor.commands.setTextSelection({ from: start, to: end });
        editor.commands.focus();
      },
      replaceRange(from, to, insert, select) {
        editor.chain().focus().insertContentAt({ from, to }, insert).run();
        if (select) editor.commands.setTextSelection({ from: select.start, to: select.end });
      },
      getCursor() {
        const head = editor.state.selection.head;
        const text = editor.state.doc.textBetween(0, head, "\n");
        const lines = text.split("\n");
        return { line: lines.length, col: lines[lines.length - 1].length + 1 };
      },
      focus() {
        editor.commands.focus();
      },
      // P2：markdown 偏移 → PM 位置映射后滚动；P1 先聚焦，不崩溃。
      scrollToOffset(_offset: number) {
        editor.commands.focus();
      },
    };
    registerEditor(paneId, handle);
    return () => unregisterEditor(paneId);
  }, [editor, paneId, tabId]);

  // ③ 回填：store → editor（外部变更 / 同文件分屏 peer 编辑）。
  // 编辑器挂载时已用 initial markdown 初始化，故跳过首轮；仅当内容「确实变化」
  // （且非本 pane 自己的写回）才整体 setContent（emitUpdate=false 防写回循环）。
  useEffect(() => {
    if (!editor || !tabId) return;
    lastWrittenRef.current =
      useTabsStore.getState().tabs.find((t) => t.id === tabId)?.content ?? "";
    return useTabsStore.subscribe((state) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      if (tab.content === lastWrittenRef.current) return; // 本 pane 自己的写回
      lastWrittenRef.current = tab.content;
      editor.commands.setContent(tab.content, false);
    });
  }, [editor, tabId]);

  return <EditorContent editor={editor} className="pm-live" />;
}
