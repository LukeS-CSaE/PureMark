/**
 * 代码块语法高亮链路测试（lowlight 实例 + TipTap 扩展 schema）。
 * 渲染侧的 .hljs-* decoration 由 CodeBlockLowlight 在浏览器中生成，
 * 此处只锁定无 DOM 依赖的部分：语言集、别名解析、高亮产出、schema 不变。
 */
import { describe, it, expect } from "vitest";
import { lowlight } from "../lib/lowlight";
import { hljsLanguages } from "../lib/highlight";
import { getSchema } from "@tiptap/core";
import { buildEditorExtensions } from "../lib/prosemirror/editorExtensions";

describe("hljsLanguages（语言集单一数据源）", () => {
  it("仅注册设计 §1.6 约定的常用语言", () => {
    expect(Object.keys(hljsLanguages).sort()).toEqual(
      ["bash", "css", "javascript", "json", "markdown", "python", "typescript", "xml"].sort(),
    );
  });
});

describe("lowlight 实例", () => {
  it("别名自动注册（js/ts/html/sh/py 可解析）", () => {
    for (const alias of ["js", "ts", "html", "sh", "py"]) {
      expect(lowlight.registered(alias)).toBe(true);
    }
  });

  it("对 javascript 代码产出高亮节点", () => {
    const tree = lowlight.highlight("javascript", "const answer = 42;");
    expect(tree.children.length).toBeGreaterThan(0);
  });

  it("未注册语言可由扩展侧 highlightAuto 兜底（实例自身提供 API）", () => {
    // CodeBlockLowlight 对未注册语言调用 highlightAuto，不抛错；
    // 实例自身的 highlight() 对未知语言则显式抛错（契约不同）。
    expect(() => lowlight.highlightAuto("abc")).not.toThrow();
    expect(() => lowlight.highlight("no-such-lang", "abc")).toThrow(/not registered/);
  });
});

describe("buildEditorExtensions schema", () => {
  it("codeBlock 节点保留且带 language 属性（与序列化器兼容）", () => {
    const schema = getSchema(buildEditorExtensions());
    expect(schema.nodes.codeBlock).toBeDefined();
    expect(schema.nodes.codeBlock.spec.attrs).toHaveProperty("language");
  });
});
