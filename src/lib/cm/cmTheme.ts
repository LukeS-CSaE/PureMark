/**
 * CodeMirror 6 theme layer (design §1.7, task T02 step 2.3).
 *
 * Hard rule from the design: `EditorView.theme` may only carry **metrics**
 * (font family, font size, padding). Every colour comes from CSS custom
 * properties declared in `src/styles/live.css` / `theme.css`, so switching
 * `<html data-theme>` re-colours the editor with zero reconfiguration.
 *
 * The syntax highlighter follows the same principle: `HighlightStyle` entries
 * use `class:` (not `color:`) and the classes are coloured in `live.css` from
 * the `--hl-*` tokens (design §1.6).
 */
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/**
 * Font metrics for one editor instance. Rebuilt (and re-dispatched through
 * `fontCompartment`) whenever `config.fontFamily` / `config.fontSize` change.
 *
 * The "paper" padding is NOT set here on purpose — it lives in `live.css`
 * (`.cm-content`, shared by both `edit` and `live` CodeMirror modes) and in
 * `pm.css` (`.pm-live` / `.pm-editor`, used by the TipTap live AND preview
 * views since preview was unified onto the same engine), all driven by the
 * same `--editor-pad-*` tokens. Keeping it in CSS gives a single source of
 * truth for the editor-card views and makes the margin apply even before the
 * JS theme is injected. This theme layer therefore only carries font metrics, as the
 * design intends.
 */
export function fontTheme(fontFamily: string, fontSize: number): Extension {
  return EditorView.theme({
    "&": { fontSize: `${fontSize}px` },
    ".cm-scroller": { fontFamily },
    ".cm-content": {
      fontFamily,
    },
  });
}

/**
 * Token → class mapping. Only class names are emitted; `live.css` maps each
 * class to an `--hl-*` variable so light/dark switch for free.
 *
 * The `md-*` classes cover Markdown's own tokens and are neutralised inside
 * `.cm-live` (the live-preview decorations own the look there); they exist so
 * the plain `edit` mode still gets readable syntax colouring.
 */
export const codeHighlightStyle: HighlightStyle = HighlightStyle.define([
  // ---- Markdown structure (visible in `edit` mode) ----
  { tag: tags.heading1, class: "cm-tok-md-heading" },
  { tag: tags.heading2, class: "cm-tok-md-heading" },
  { tag: tags.heading3, class: "cm-tok-md-heading" },
  { tag: tags.heading4, class: "cm-tok-md-heading" },
  { tag: tags.heading5, class: "cm-tok-md-heading" },
  { tag: tags.heading6, class: "cm-tok-md-heading" },
  { tag: tags.strong, class: "cm-tok-md-strong" },
  { tag: tags.emphasis, class: "cm-tok-md-em" },
  { tag: tags.strikethrough, class: "cm-tok-md-del" },
  { tag: tags.link, class: "cm-tok-md-link" },
  { tag: tags.url, class: "cm-tok-md-url" },
  { tag: tags.monospace, class: "cm-tok-md-code" },
  { tag: tags.quote, class: "cm-tok-md-quote" },
  { tag: tags.list, class: "cm-tok-md-list" },
  { tag: tags.contentSeparator, class: "cm-tok-md-sep" },
  { tag: tags.processingInstruction, class: "cm-tok-md-mark" },

  // ---- Generic code tokens (fenced blocks) ----
  { tag: tags.comment, class: "cm-tok-comment" },
  { tag: tags.lineComment, class: "cm-tok-comment" },
  { tag: tags.blockComment, class: "cm-tok-comment" },
  { tag: tags.keyword, class: "cm-tok-keyword" },
  { tag: tags.controlKeyword, class: "cm-tok-keyword" },
  { tag: tags.moduleKeyword, class: "cm-tok-keyword" },
  { tag: tags.definitionKeyword, class: "cm-tok-keyword" },
  { tag: tags.operatorKeyword, class: "cm-tok-keyword" },
  { tag: tags.string, class: "cm-tok-string" },
  { tag: tags.special(tags.string), class: "cm-tok-string" },
  { tag: tags.regexp, class: "cm-tok-string" },
  { tag: tags.number, class: "cm-tok-number" },
  { tag: tags.integer, class: "cm-tok-number" },
  { tag: tags.float, class: "cm-tok-number" },
  { tag: tags.bool, class: "cm-tok-literal" },
  { tag: tags.null, class: "cm-tok-literal" },
  { tag: tags.atom, class: "cm-tok-literal" },
  { tag: tags.typeName, class: "cm-tok-type" },
  { tag: tags.className, class: "cm-tok-type" },
  { tag: tags.namespace, class: "cm-tok-type" },
  { tag: tags.standard(tags.variableName), class: "cm-tok-type" },
  { tag: tags.variableName, class: "cm-tok-variable" },
  { tag: tags.propertyName, class: "cm-tok-variable" },
  { tag: tags.attributeName, class: "cm-tok-variable" },
  { tag: tags.attributeValue, class: "cm-tok-string" },
  { tag: tags.function(tags.variableName), class: "cm-tok-title" },
  { tag: tags.function(tags.propertyName), class: "cm-tok-title" },
  { tag: tags.definition(tags.variableName), class: "cm-tok-title" },
  { tag: tags.tagName, class: "cm-tok-keyword" },
  { tag: tags.meta, class: "cm-tok-meta" },
  { tag: tags.punctuation, class: "cm-tok-meta" },
  { tag: tags.bracket, class: "cm-tok-meta" },
  { tag: tags.escape, class: "cm-tok-symbol" },
  { tag: tags.labelName, class: "cm-tok-symbol" },
  { tag: tags.inserted, class: "cm-tok-addition" },
  { tag: tags.deleted, class: "cm-tok-deletion" },
  { tag: tags.invalid, class: "cm-tok-invalid" },
]);

/** Ready-to-use extension; part of `baseExtensions()`. */
export const codeHighlighting: Extension = syntaxHighlighting(codeHighlightStyle);
