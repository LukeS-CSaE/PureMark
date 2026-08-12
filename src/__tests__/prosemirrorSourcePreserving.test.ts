/**
 * Unit tests for the source-preserving markdown serializer (Phase 1).
 *
 * Runs under vitest's `node` environment (no jsdom): we build real ProseMirror
 * documents from the TipTap schema via `getSchema` (pure, no DOM) and assert the
 * source-preserving invariants without needing a mounted editor.
 *
 * Invariants covered:
 *   1. Unedited doc -> byte-identical markdown (source blocks echoed verbatim).
 *   2. Edited block  -> only that block is re-serialized; siblings stay byte-exact.
 *   3. Structural mismatch (block count differs) -> matched=false
 *      (caller must fall back to a full default serialization).
 *   4. sliceSource() computes correct top-level block offsets / separators.
 */
import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { sliceSource } from "../lib/prosemirror/sourceSlice";
import { nodeSignature, serializeSourcePreserving } from "../lib/prosemirror/sourcePreserving";
import { buildMarkdownSerializer, serializeNodeToMarkdown } from "../lib/prosemirror/markdownSerializer";

const schema: Schema = getSchema([
  StarterKit,
  Link,
  Image,
  TaskList,
  TaskItem.configure({ nested: true }),
  Placeholder,
]);

const serializer = buildMarkdownSerializer(schema);

function docFrom(children: PMNode[]): PMNode {
  return schema.nodes.doc.create(null, children);
}

function serialize(doc: PMNode, originalDoc: PMNode, original: string) {
  return serializeSourcePreserving(doc, originalDoc, original, (n) =>
    serializeNodeToMarkdown(n, serializer),
  );
}

describe("sliceSource", () => {
  it("splits top-level blocks and keeps separators", () => {
    const text = "# Hello\n\nWorld\n";
    const { blocks, seps } = sliceSource(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].src).toBe("# Hello");
    expect(blocks[1].src).toBe("World");
    // seps has blocks.length + 1 = 3 entries; reassembly must be byte-identical
    expect(seps[0] + blocks[0].src + seps[1] + blocks[1].src + seps[2]).toBe(text);
  });

  it("treats a GFM table as one top-level block", () => {
    const text = "| a | b |\n| - | - |\n| 1 | 2 |\n\ntrailing\n";
    const { blocks } = sliceSource(text);
    expect(blocks[0].src.startsWith("| a | b |")).toBe(true);
    expect(blocks[1].src).toBe("trailing");
  });
});

describe("serializeSourcePreserving", () => {
  it("echoes original byte-for-byte when nothing is edited", () => {
    const original = "# Hello\n\nWorld\n";
    const doc = docFrom([
      schema.nodes.heading.create({ level: 1 }, schema.text("Hello")),
      schema.nodes.paragraph.create(null, schema.text("World")),
    ]);
    const originalDoc = docFrom([
      schema.nodes.heading.create({ level: 1 }, schema.text("Hello")),
      schema.nodes.paragraph.create(null, schema.text("World")),
    ]);
    const res = serialize(doc, originalDoc, original);
    expect(res.matched).toBe(true);
    expect(res.markdown).toBe(original);
  });

  it("re-serializes only the edited block; siblings stay byte-exact", () => {
    const original = "# Hello\n\nWorld\n";
    const originalDoc = docFrom([
      schema.nodes.heading.create({ level: 1 }, schema.text("Hello")),
      schema.nodes.paragraph.create(null, schema.text("World")),
    ]);
    const doc = docFrom([
      schema.nodes.heading.create({ level: 1 }, schema.text("Hello")),
      schema.nodes.paragraph.create(null, schema.text("World!!")),
    ]);
    const res = serialize(doc, originalDoc, original);
    expect(res.matched).toBe(true);
    expect(res.markdown).toBe("# Hello\n\nWorld!!\n");
  });

  it("flags matched=false on a structural change (block count differs)", () => {
    const original = "# Hello\n\nWorld\n";
    const originalDoc = docFrom([
      schema.nodes.heading.create({ level: 1 }, schema.text("Hello")),
      schema.nodes.paragraph.create(null, schema.text("World")),
    ]);
    const doc = docFrom([
      schema.nodes.paragraph.create(null, schema.text("World")),
    ]);
    const res = serialize(doc, originalDoc, original);
    expect(res.matched).toBe(false);
  });

  it("round-trips a list (with blank-line between items) without touching byte boundaries", () => {
    // markdown-it renders "- a\n- b\n\n- c\n" as ONE <ul>, so tiptap-markdown
    // (markdown -> HTML -> PM) and sliceSource (markdown-it tokens) agree on a
    // single top-level block. The whole list is echoed verbatim.
    const original = "- a\n- b\n\n- c\n";
    const list = schema.nodes.bulletList.create(null, [
      schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, schema.text("a"))),
      schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, schema.text("b"))),
      schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, schema.text("c"))),
    ]);
    const originalDoc = docFrom([list]);
    const doc = docFrom([list]);
    const res = serialize(doc, originalDoc, original);
    expect(res.matched).toBe(true);
    expect(res.markdown).toBe(original);
  });

  it("re-serializes an edited list item while the block stays a single block", () => {
    const original = "- a\n- b\n- c\n";
    const originalList = schema.nodes.bulletList.create(null, [
      schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, schema.text("a"))),
      schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, schema.text("b"))),
      schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, schema.text("c"))),
    ]);
    const editedList = schema.nodes.bulletList.create(null, [
      schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, schema.text("a"))),
      schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, schema.text("b"))),
      schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, schema.text("c!!"))),
    ]);
    const res = serialize(docFrom([editedList]), docFrom([originalList]), original);
    expect(res.matched).toBe(true);
    // TipTap list nodes carry no `tight` attr, so re-serialization renders a
    // *loose* list (blank lines between items). This matches tiptap-markdown's
    // native getMarkdown behaviour. Unchanged lists are still echoed verbatim
    // (see previous test), so byte-level fidelity holds for untouched content.
    expect(res.markdown).toBe("- a\n\n- b\n\n- c!!\n");
  });

  it("nodeSignature is stable for identical content", () => {
    const a = schema.nodes.paragraph.create(null, schema.text("x"));
    const b = schema.nodes.paragraph.create(null, schema.text("x"));
    expect(nodeSignature(a)).toBe(nodeSignature(b));
    const c = schema.nodes.paragraph.create(null, schema.text("y"));
    expect(nodeSignature(a)).not.toBe(nodeSignature(c));
  });
});
