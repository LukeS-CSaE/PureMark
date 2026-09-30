/**
 * lenientImage 纯函数测试（无 DOM / markdown-it 依赖）。
 *
 * 覆盖「宽松图片路径预处理」的包裹规则、保守策略与幂等性：
 *   - 行内图片 URL 含未编码空格 → 包成 `<...>`（CommonMark 原生不支持，Typora 容忍）
 *   - 引用定义行 URL 含空格 → 同样包裹
 *   - 无空格 / 已是 <...> / 含 <> / 代码围栏内 → 一律不动
 */
import { describe, expect, it } from "vitest";
import { preprocessLenientImages } from "../lib/prosemirror/lenientImage";

describe("preprocessLenientImages — 行内图片", () => {
  it("URL 带空格：包成 <...>", () => {
    expect(preprocessLenientImages("![alt](my img.png)")).toBe("![alt](<my img.png>)");
  });

  it("URL 带空格且有引号标题：仅包裹 URL，标题原样保留", () => {
    expect(preprocessLenientImages('![a](屏幕截图 1.png "标题")')).toBe(
      '![a](<屏幕截图 1.png> "标题")',
    );
  });

  it("中文文件名带空格与日期：包裹", () => {
    expect(preprocessLenientImages("![a](屏幕截图 2026-09-30.png)")).toBe(
      "![a](<屏幕截图 2026-09-30.png>)",
    );
  });

  it("URL 无空格：不动", () => {
    expect(preprocessLenientImages("![alt](image.png)")).toBe("![alt](image.png)");
    expect(preprocessLenientImages("![a](assets/sub/x.png)")).toBe("![a](assets/sub/x.png)");
  });

  it("已是 <...> 形式：幂等不动", () => {
    expect(preprocessLenientImages("![a](<my img.png>)")).toBe("![a](<my img.png>)");
  });

  it("不像路径的目标（纯词组、无扩展名）：不包裹，避免误伤文本", () => {
    expect(preprocessLenientImages("![注](见 下文 说明)")).toBe("![注](见 下文 说明)");
  });

  it("在线 URL 带空格：包裹（合法化）", () => {
    expect(preprocessLenientImages("![a](https://x.com/a b.png)")).toBe(
      "![a](<https://x.com/a b.png>)",
    );
  });

  it("含 <> 字符的 URL：不动（无法安全包裹）", () => {
    expect(preprocessLenientImages("![a](a<b c.png)")).toBe("![a](a<b c.png)");
  });

  it("链接（无 ! 前缀）不受影响", () => {
    expect(preprocessLenientImages("[text](my img.png)")).toBe("[text](my img.png)");
  });

  it("同一行多张图片与普通文本混合", () => {
    const src = "前文 ![a](x 1.png) 中 ![b](y.png) ![c](z 2.png) 后文";
    expect(preprocessLenientImages(src)).toBe(
      "前文 ![a](<x 1.png>) 中 ![b](y.png) ![c](<z 2.png>) 后文",
    );
  });
});

describe("preprocessLenientImages — 引用定义", () => {
  it("定义 URL 带空格：包成 <...>", () => {
    expect(preprocessLenientImages("[ref]: my image.png")).toBe("[ref]: <my image.png>");
  });

  it("定义 URL 带空格 + 标题：仅包裹 URL", () => {
    expect(preprocessLenientImages('[ref]: my image.png "标题"')).toBe(
      '[ref]: <my image.png> "标题"',
    );
  });

  it("像普通文字的冒号行（无扩展名）：不动", () => {
    expect(preprocessLenientImages("[作者]: 张三 李四")).toBe("[作者]: 张三 李四");
  });

  it("无空格定义：不动", () => {
    expect(preprocessLenientImages("[img1]: assets/a.png")).toBe("[img1]: assets/a.png");
  });
});

describe("preprocessLenientImages — 保守边界", () => {
  it("代码围栏内不动", () => {
    const src = "```md\n![a](my img.png)\n[ref]: my image.png\n```\n![b](out side.png)";
    expect(preprocessLenientImages(src)).toBe(
      "```md\n![a](my img.png)\n[ref]: my image.png\n```\n![b](<out side.png>)",
    );
  });

  it("波浪线围栏内不动", () => {
    const src = "~~~\n![a](my img.png)\n~~~";
    expect(preprocessLenientImages(src)).toBe(src);
  });

  it("幂等：重复执行无变化", () => {
    const once = preprocessLenientImages('![a](my img.png "t")\n[ref]: q w.md');
    expect(preprocessLenientImages(once)).toBe(once);
  });

  it("空串 / 无图片文本：原样返回", () => {
    expect(preprocessLenientImages("")).toBe("");
    expect(preprocessLenientImages("普通文本，无图片。")).toBe("普通文本，无图片。");
  });
});
