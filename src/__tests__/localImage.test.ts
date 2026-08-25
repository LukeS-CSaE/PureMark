/**
 * localImage 纯函数测试（无 DOM / Tauri 依赖）。
 *
 * toAssetUrl 用 mock 注入，验证「相对路径→绝对路径拼接」与「绝对路径原样放行」。
 * 这覆盖了本地图片无法渲染的核心修复逻辑：在线图片走绝对 URL 原样返回、
 * 本地相对路径经文档目录拼接 + convertFileSrc 转 asset URL。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveImageSrc } from "../lib/prosemirror/localImage";

/** mock asset 转换器：直接把绝对路径包成 asset: URL，便于断言入参。 */
const toAsset = vi.fn((p: string) => `asset://${p}`);

describe("resolveImageSrc", () => {
  beforeEach(() => toAsset.mockClear());

  it("空 src 原样返回", () => {
    expect(resolveImageSrc("", "/docs", toAsset)).toBe("");
    expect(toAsset).not.toHaveBeenCalled();
  });

  it("在线 http(s) URL 原样返回，不调转换器", () => {
    expect(resolveImageSrc("https://example.com/a.png", "/docs", toAsset)).toBe(
      "https://example.com/a.png",
    );
    expect(resolveImageSrc("http://x.com/b.gif", "/docs", toAsset)).toBe("http://x.com/b.gif");
    expect(toAsset).not.toHaveBeenCalled();
  });

  it("data/blob/asset 协议原样返回，不调转换器", () => {
    expect(resolveImageSrc("data:image/png;base64,xx", "/docs", toAsset)).toBe(
      "data:image/png;base64,xx",
    );
    expect(resolveImageSrc("blob:https://x/yy", "/docs", toAsset)).toBe("blob:https://x/yy");
    expect(resolveImageSrc("asset://localhost/z", "/docs", toAsset)).toBe("asset://localhost/z");
    expect(toAsset).not.toHaveBeenCalled();
  });

  it("相对路径 + Windows documentDir：拼绝对路径并归一化分隔符后转换", () => {
    const out = resolveImageSrc("assets/a.png", "C:\\docs\\notes", toAsset);
    expect(toAsset).toHaveBeenCalledWith("C:/docs/notes/assets/a.png");
    expect(out).toBe("asset://C:/docs/notes/assets/a.png");
  });

  it("相对路径 + Unix documentDir：拼绝对路径后转换", () => {
    const out = resolveImageSrc("img/x.png", "/home/u/notes", toAsset);
    expect(toAsset).toHaveBeenCalledWith("/home/u/notes/img/x.png");
    expect(out).toBe("asset:///home/u/notes/img/x.png");
  });

  it("相对路径但 documentDir 为空（未保存文档）→ 原样返回，不调转换器", () => {
    expect(resolveImageSrc("assets/a.png", "", toAsset)).toBe("assets/a.png");
    expect(toAsset).not.toHaveBeenCalled();
  });

  it("绝对本地文件路径（Windows 盘符）直接转换，不拼 documentDir", () => {
    const out = resolveImageSrc("C:\\images\\a.png", "/docs", toAsset);
    expect(toAsset).toHaveBeenCalledWith("C:/images/a.png");
    expect(out).toBe("asset://C:/images/a.png");
  });

  it("绝对本地文件路径（Unix 根）直接转换，不拼 documentDir", () => {
    const out = resolveImageSrc("/abs/path/a.png", "/docs", toAsset);
    expect(toAsset).toHaveBeenCalledWith("/abs/path/a.png");
    expect(out).toBe("asset:///abs/path/a.png");
  });
});
