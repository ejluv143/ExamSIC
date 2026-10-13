"use client";

import { MarkdownEditor } from "@/components/markdown-editor";
import type { InputProps } from "../views/input";

// The essay is written in markdown.
export function Input({ value, onChange }: InputProps<"essay">) {
  return (
    <MarkdownEditor
      value={typeof value === "string" ? value : ""}
      onChange={onChange}
      label="Your answer"
      rows={8}
      placeholder="Write your answer…"
    />
  );
}
