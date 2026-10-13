"use client";

import type { EditorProps } from "../views/editor";
import { RubricEditor } from "../shared/editor-rubric";

export function Editor({ q, onChange }: EditorProps<"essay">) {
  return <RubricEditor q={q} onChange={onChange} />;
}
