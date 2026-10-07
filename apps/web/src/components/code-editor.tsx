"use client";

import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { php } from "@codemirror/lang-php";
import { python } from "@codemirror/lang-python";
import { sql, SQLite } from "@codemirror/lang-sql";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { CodeLanguage } from "@/lib/types";

export type EditorLanguage = CodeLanguage | "sql";

const languages: Record<EditorLanguage, () => ReturnType<typeof python>> = {
  python,
  java,
  cpp,
  c: cpp,
  javascript,
  php: () => php(),
  sql: () => sql({ dialect: SQLite, upperCaseKeywords: true }),
};

// Colors from the app's theme tokens, so the editor follows light and dark mode.
const theme = EditorView.theme({
  "&": {
    backgroundColor: "var(--surface)",
    color: "var(--foreground)",
    fontSize: "13px",
    border: "1px solid var(--border)",
    borderRadius: "0.5rem",
    overflow: "hidden",
  },
  "&.cm-focused": { outline: "2px solid color-mix(in srgb, var(--primary) 30%, transparent)" },
  ".cm-scroller": { fontFamily: "var(--font-mono), ui-monospace, monospace", lineHeight: "1.55" },
  ".cm-content": { caretColor: "var(--foreground)", padding: "8px 0" },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  ".cm-gutters": { backgroundColor: "var(--surface-muted)", color: "var(--muted)", border: "none" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--primary) 6%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--primary) 10%, transparent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--primary) 25%, transparent)",
  },
});

const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword], color: "var(--primary)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--success)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--warning)" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--muted)", fontStyle: "italic" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.definition(tags.function(tags.variableName))], color: "var(--info)" },
  { tag: [tags.typeName, tags.className], color: "var(--danger)" },
]);

export function CodeEditor({
  value,
  onChange,
  language,
  readOnly = false,
  minLines = 10,
  label,
  onEdit,
}: {
  value: string;
  onChange?: (value: string) => void;
  language: EditorLanguage;
  readOnly?: boolean;
  minLines?: number;
  label: string;
  // Each change as replace-[from, to)-with-insert, in an order that can be applied one after another.
  onEdit?: (edits: { from: number; to: number; insert: string }[]) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const languageSlot = useRef(new Compartment());
  const latestOnChange = useRef(onChange);
  const latestOnEdit = useRef(onEdit);
  useEffect(() => {
    latestOnChange.current = onChange;
    latestOnEdit.current = onEdit;
  });

  // Built once; later prop changes are pushed in below instead of rebuilding (which would lose the cursor).
  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          indentUnit.of("    "),
          languageSlot.current.of(languages[language]()),
          syntaxHighlighting(highlight),
          theme,
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({ "aria-label": label, spellcheck: "false", autocorrect: "off", autocapitalize: "off" }),
          EditorView.theme({ ".cm-content, .cm-gutter": { minHeight: `${minLines * 1.55 + 1}em` } }),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            latestOnChange.current?.(u.state.doc.toString());
            if (!latestOnEdit.current) return;
            // iterChanges positions are in the old text; shift each by what earlier changes added or removed.
            const edits: { from: number; to: number; insert: string }[] = [];
            let shift = 0;
            u.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
              const insert = inserted.toString();
              edits.push({ from: fromA + shift, to: toA + shift, insert });
              shift += insert.length - (toA - fromA);
            });
            latestOnEdit.current(edits);
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // Set up once per mount; value and language are synced by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  useEffect(() => {
    view.current?.dispatch({ effects: languageSlot.current.reconfigure(languages[language]()) });
  }, [language]);

  // Outside changes (reset to starter code, switching submissions) replace the text.
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={host} className="min-w-0 text-left" />;
}
