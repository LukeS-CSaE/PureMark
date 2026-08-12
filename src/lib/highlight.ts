/**
 * highlight.js initialization. Only the common languages used for Markdown
 * authoring are registered to keep the bundle small (per the system design).
 */
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml); // used for HTML
hljs.registerLanguage("css", css);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("python", python);

/** Highlight a single `<code>` element produced by marked. */
export function highlightElement(el: HTMLElement): void {
  try {
    hljs.highlightElement(el);
  } catch {
    /* unknown language — leave as-is */
  }
}

export default hljs;
