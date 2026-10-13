"use client";

import { markdown } from "@codemirror/lang-markdown";
import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { useEffect, useRef, type RefObject } from "react";
import type { Locale } from "@archive/contracts";

export function MarkdownEditor({
  initialValue,
  textareaRef,
  locale,
}: {
  initialValue: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  locale: Locale;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  useEffect(() => {
    const parent = host.current;
    const field = textareaRef.current;
    if (!parent || !field) return;
    const editor = new EditorView({
      parent,
      state: EditorState.create({
        doc: field.value,
        extensions: [
          markdown(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          syntaxHighlighting(defaultHighlightStyle),
          lineNumbers(),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            "aria-label": locale === "ko" ? "Markdown 원문 편집기" : "Markdown source editor",
            spellcheck: "true",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) field.value = update.state.doc.toString();
            if (update.docChanged || update.selectionSet) {
              field.setSelectionRange(
                update.state.selection.main.from,
                update.state.selection.main.to,
              );
            }
          }),
          EditorView.theme({
            "&": { backgroundColor: "#fffefc", borderRadius: "16px", border: "1px solid #ded3d6" },
            ".cm-content": {
              fontFamily: "ui-monospace,Consolas,monospace",
              fontSize: "14px",
              lineHeight: "1.8",
              padding: "20px",
              minHeight: "440px",
            },
            ".cm-scroller": { maxHeight: "650px", overflow: "auto" },
            "&.cm-focused": { outline: "3px solid #bc8f98", outlineOffset: "3px" },
            ".cm-cursor": { borderLeftColor: "#76545c" },
            ".cm-line": { padding: "0" },
            "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
              backgroundColor: "#eee0e5",
            },
          }),
        ],
      }),
    });
    view.current = editor;
    field.hidden = true;
    field.required = false;
    const synchronize = () => {
      if (field.value !== editor.state.doc.toString())
        editor.dispatch({
          changes: { from: 0, to: editor.state.doc.length, insert: field.value },
          selection: { anchor: field.selectionStart },
        });
      editor.focus();
    };
    field.addEventListener("input", synchronize);
    return () => {
      field.hidden = false;
      field.required = true;
      field.removeEventListener("input", synchronize);
      editor.destroy();
      view.current = null;
    };
  }, [locale, textareaRef]);
  function wrap(before: string, after: string) {
    const editor = view.current;
    const field = textareaRef.current;
    if (!field) return;
    if (editor) {
      const { from, to } = editor.state.selection.main;
      const selected = editor.state.doc.sliceString(from, to);
      editor.dispatch({
        changes: { from, to, insert: `${before}${selected}${after}` },
        selection: { anchor: from + before.length, head: from + before.length + selected.length },
      });
      editor.focus();
    } else {
      const start = field.selectionStart;
      const end = field.selectionEnd;
      const selected = field.value.slice(start, end);
      field.setRangeText(`${before}${selected}${after}`, start, end, "select");
      field.focus();
    }
  }
  return (
    <div className="markdown-editor">
      <div
        className="markdown-toolbar"
        role="toolbar"
        aria-label={locale === "ko" ? "Markdown 서식" : "Markdown formatting"}
      >
        <button
          type="button"
          onClick={() => wrap("**", "**")}
          aria-label={locale === "ko" ? "굵게" : "Bold"}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          onClick={() => wrap("_", "_")}
          aria-label={locale === "ko" ? "기울임" : "Italic"}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          onClick={() => wrap("\n## ", "\n")}
          aria-label={locale === "ko" ? "제목 삽입" : "Insert heading"}
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => wrap("[", "](https://example.com)")}
          aria-label={locale === "ko" ? "링크 삽입" : "Insert link"}
        >
          ↗
        </button>
        <button
          type="button"
          onClick={() => wrap("\n```\n", "\n```\n")}
          aria-label={locale === "ko" ? "코드 블록 삽입" : "Insert code block"}
        >
          {"</>"}
        </button>
      </div>
      <div ref={host} />
      <textarea
        ref={textareaRef}
        name="sourceMarkdown"
        required
        spellCheck
        defaultValue={initialValue}
        aria-label={locale === "ko" ? "Markdown 원문" : "Markdown source"}
      />
    </div>
  );
}
