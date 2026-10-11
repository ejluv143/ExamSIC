"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { formatJoinKey } from "@examinus/contract";

// A session's join key that copies itself on click.
export function JoinKey({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const key = formatJoinKey(code);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(key);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copy the join key"
      className="group inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-1 font-mono text-sm font-semibold tracking-widest hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span className="sr-only">Join key </span>
      {key}
      {copied ? <Check className="size-3.5 text-success" aria-label="Copied" /> : <Copy className="size-3.5 text-muted group-hover:text-primary" aria-hidden />}
    </button>
  );
}
