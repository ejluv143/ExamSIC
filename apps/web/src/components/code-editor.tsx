"use client";

import { lazy, Suspense } from "react";
import type { CodeLanguage } from "@examinus/domain/kinds/code";

export type EditorLanguage = CodeLanguage | "sql";

export type CodeEditorProps = {
  value: string;
  onChange?: (value: string) => void;
  language: EditorLanguage;
  readOnly?: boolean;
  minLines?: number;
  label: string;
  // Each change as replace-[from, to)-with-insert, in an order that can be applied one after another.
  onEdit?: (edits: { from: number; to: number; insert: string }[]) => void;
};

// CodeMirror and its languages are most of a page's script; they load the first time a code box renders instead
// of with every page that might show one.
const View = lazy(() => import("./code-editor-view").then((m) => ({ default: m.CodeEditorView })));

// A code box. Until the editor has loaded, a box of the same height holds its place so nothing below jumps.
export function CodeEditor(props: CodeEditorProps) {
  return (
    <Suspense
      fallback={
        <div
          aria-busy="true"
          aria-label={props.label}
          className="rounded-lg border border-border bg-surface-muted/50 motion-safe:animate-pulse"
          style={{ minHeight: `calc(${props.minLines ?? 10} * 1.55em + 1em + 2px)` }}
        />
      }
    >
      <View {...props} />
    </Suspense>
  );
}
