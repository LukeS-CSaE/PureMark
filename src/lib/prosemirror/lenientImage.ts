/**
 * 宽松图片路径预处理 —— 补齐 CommonMark 不容忍的图片写法。
 *
 * 背景：CommonMark（markdown-it）规定行内图片/链接的 URL 出现未编码空格
 * 即不构成语法（`![a](my img.png)` 整段按字面文本显示）。但中文用户高频
 * 写出「带空格的截图文件名」，Typora 等编辑器均容忍此写法。
 *
 * 本模块在 markdown-it 解析前做一次源码级预处理（经 LocalImage 的
 * `storage.markdown.parse.setup` 钩子注册为 core 规则）：
 *   - `![alt](url 带空格.png "title")` → `![alt](<url 带空格.png> "title")`
 *   - `[ref]: url 带空格.png "title"`  → `[ref]: <url 带空格.png> "title"`
 *
 * 保守策略（避免误伤普通文本）：
 *   - 仅当目标「像路径/URL」才包裹（有扩展名后缀、或以 http(s)://、/、盘符开头）；
 *   - 已是 `<...>`、不含空格、含 `<>` 字符的目标一律不动；
 *   - 代码围栏（``` / ~~~）内的内容不动。
 *
 * 幂等：重复执行无变化（包裹后 `<...>` 会被再次跳过）。
 */

/** 行内图片：`![alt](content)`。content 不跨行、不含裸括号（与 CommonMark 一致）。 */
const INLINE_IMAGE_RE = /(!\[[^\]\n]*\]\()([^()\n]*)(\))/g;
/** 引用定义行：`[label]: rest`（0-3 缩进）。 */
const REF_DEF_RE = /^(\s{0,3}\[[^\]\n]+\]:\s*)([^\n]*)$/gm;

interface DestParts {
  dest: string;
  /** 原样保留的尾部标题（含引号），如 ` "标题"`；无则空串。 */
  title: string;
}

/** 从 `(content)` 内容里拆出目标与尾部可选的引号标题。 */
function splitTitle(content: string): DestParts {
  const m = content.match(/\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*$/);
  if (m) {
    return { dest: content.slice(0, m.index).trimEnd(), title: " " + m[1] };
  }
  return { dest: content.trim(), title: "" };
}

/**
 * 目标是否值得包裹：含未编码空格、不是 `<...>` 形式、
 * 且「像路径/URL」（扩展名后缀 / http(s):// / 绝对路径开头）。
 */
function needsWrap(dest: string): boolean {
  if (!dest || !dest.includes(" ")) return false;
  if (dest.startsWith("<") || dest.includes("<") || dest.includes(">")) return false;
  return /(^https?:\/\/)|(^[a-zA-Z]:[\\/])|(^[\\/])|(\.[a-zA-Z0-9]{1,8}$)/.test(dest);
}

/** 把 dest 包成 `<...>`，title 原样跟在后面。 */
function wrap(dest: string, title: string): string {
  return `<${dest}>${title}`;
}

/** 单行重写：先行内图片，再引用定义。 */
function rewriteLine(line: string): string {
  let out = line.replace(INLINE_IMAGE_RE, (all, head: string, content: string, tail: string) => {
    const { dest, title } = splitTitle(content);
    if (!needsWrap(dest)) return all;
    return `${head}${wrap(dest, title)}${tail}`;
  });
  out = out.replace(REF_DEF_RE, (all, head: string, rest: string) => {
    const { dest, title } = splitTitle(rest);
    if (!needsWrap(dest)) return all;
    return `${head}${wrap(dest, title)}`;
  });
  return out;
}

/**
 * 对整份 markdown 做宽松图片路径预处理。逐行扫描并跳过代码围栏，
 * 幂等可重入（规则重复注册/重复执行均无副作用）。
 */
export function preprocessLenientImages(md: string): string {
  const lines = md.split("\n");
  let inFence = false;
  let fenceMarker = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;
    lines[i] = rewriteLine(line);
  }
  return lines.join("\n");
}

/** markdown-it 实例的最小结构类型（避免引入直接依赖）。 */
interface MarkdownItLike {
  core?: { ruler?: { before?(name: string, rule: string, fn: (state: { src: string }) => boolean): void } };
}

/** 已注册过规则的实例集合（每个编辑器只注册一次）。 */
const applied = new WeakSet<object>();

/**
 * 把预处理注册为 markdown-it core 规则（经 tiptap-markdown 的
 * `parse.setup` 钩子调用）。同一 md 实例只注册一次；规则幂等。
 */
export function registerLenientImageRule(md: MarkdownItLike): void {
  const before = md?.core?.ruler?.before;
  if (!before || applied.has(md as object)) return;
  applied.add(md as object);
  before.call(md.core!.ruler, "block", "lenient_image_paths", (state) => {
    state.src = preprocessLenientImages(state.src);
    return true;
  });
}
