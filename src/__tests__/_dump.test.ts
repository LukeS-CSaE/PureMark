import { describe, it } from "vitest";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";

describe("tree dump", () => {
  it("prints structure", () => {
    const src = [
      "## H2 title",
      "Some **bold** *em* ~~del~~ `code`.",
      "[link text](https://example.com \"t\") ![img](x.png)",
      "- bullet one",
      "- [x] task done",
      "1. ordered one",
      "> quote line",
      "> second",
      "---",
      "```js",
      "const a = 1;",
      "```",
      "| a | b |",
      "| --- | --- |",
      "| 1 | 2 |",
      "<https://auto.link>",
    ].join("\n");
    const tree = markdown({ base: markdownLanguage }).language.parser.parse(src);
    const out: string[] = [];
    let depth = 0;
    tree.iterate({
      enter(n) {
        out.push(
          "  ".repeat(depth) +
            n.name +
            " [" +
            n.from +
            "," +
            n.to +
            "] " +
            JSON.stringify(src.slice(n.from, Math.min(n.to, n.from + 30))),
        );
        depth++;
      },
      leave() {
        depth--;
      },
    });
    console.log("\n" + out.join("\n"));
  });
});
