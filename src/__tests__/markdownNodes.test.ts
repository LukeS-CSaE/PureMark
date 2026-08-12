/**
 * Contract test for the Lezer node names that `src/lib/cm/markdownDecor.ts`
 * maps to decorations (design §1.1.3 + guard-rail note: "dump first, then write
 * the mapping table — never hardcode without verifying").
 *
 * `@codemirror/lang-markdown` can rename or restructure nodes between minor
 * versions; if that ever happens this test fails loudly instead of silently
 * disabling live preview.
 */
import { describe, expect, it } from "vitest";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";

const SAMPLE = [
  "# H1 title",
  "## H2 title",
  "### H3 title",
  "#### H4 title",
  "##### H5 title",
  "###### H6 title",
  "",
  "Some **bold** and *em* and ~~del~~ and `code` text.",
  "",
  "[link text](https://example.com) and ![img](x.png)",
  "",
  "- bullet one",
  "- [ ] task open",
  "- [x] task done",
  "",
  "1. ordered one",
  "2. ordered two",
  "",
  "> quote line",
  "",
  "---",
  "",
  "```js",
  "const a = 1;",
  "```",
  "",
  "| a | b |",
  "| --- | --- |",
  "| 1 | 2 |",
  "",
].join("\n");

/** Collect every distinct node name produced for the sample document. */
function collectNodeNames(source: string, gfm: boolean): Set<string> {
  const lang = gfm ? markdown({ base: markdownLanguage }) : markdown();
  const tree = lang.language.parser.parse(source);
  const names = new Set<string>();
  tree.iterate({
    enter(node) {
      names.add(node.name);
    },
  });
  return names;
}

const NAMES = collectNodeNames(SAMPLE, true);

describe("Lezer markdown node names — block level", () => {
  it.each([
    "ATXHeading1",
    "ATXHeading2",
    "ATXHeading3",
    "ATXHeading4",
    "ATXHeading5",
    "ATXHeading6",
    "Blockquote",
    "BulletList",
    "OrderedList",
    "ListItem",
    "HorizontalRule",
    "FencedCode",
    "Paragraph",
  ])("emits %s", (name) => {
    expect(NAMES.has(name)).toBe(true);
  });
});

describe("Lezer markdown node names — inline level", () => {
  it.each(["Emphasis", "StrongEmphasis", "InlineCode", "Link", "Image"])(
    "emits %s",
    (name) => {
      expect(NAMES.has(name)).toBe(true);
    },
  );
});

describe("Lezer markdown node names — syntax marks (hide targets)", () => {
  it.each([
    "HeaderMark",
    "QuoteMark",
    "ListMark",
    "LinkMark",
    "EmphasisMark",
    "CodeMark",
    "CodeInfo",
    "CodeText",
    "URL",
  ])("emits %s", (name) => {
    expect(NAMES.has(name)).toBe(true);
  });
});

describe("Lezer markdown node names — GFM extensions", () => {
  it.each([
    "Strikethrough",
    "StrikethroughMark",
    "Task",
    "TaskMarker",
    "Table",
    "TableHeader",
    "TableRow",
    "TableCell",
    "TableDelimiter",
  ])("emits %s", (name) => {
    expect(NAMES.has(name)).toBe(true);
  });
});

/**
 * REGRESSION GUARD (deviation from design §1.1.3, which assumed "GFM is on by
 * default"): `markdown()` defaults to `base: commonmarkLanguage`, so GFM nodes
 * are ABSENT unless `base: markdownLanguage` is passed explicitly. This is why
 * `src/lib/cm/setup.ts` must construct the extension as
 * `markdown({ base: markdownLanguage, ... })`.
 */
describe("GFM requires an explicit base", () => {
  const commonmarkNames = collectNodeNames(SAMPLE, false);

  it.each(["Strikethrough", "Task", "Table"])(
    "does NOT emit %s with the commonmark base",
    (name) => {
      expect(commonmarkNames.has(name)).toBe(false);
    },
  );

  it("still emits plain commonmark nodes with either base", () => {
    expect(commonmarkNames.has("ATXHeading1")).toBe(true);
    expect(commonmarkNames.has("StrongEmphasis")).toBe(true);
  });
});
