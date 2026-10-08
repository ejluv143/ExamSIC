"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

// The session's join key with a button that copies it.
export function CopyKey({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5">
      <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs tracking-wider">{code}</code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label={copied ? "Key copied" : `Copy key ${code}`}
        title={copied ? "Copied" : "Copy key"}
        className="rounded p-1 text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
      >
        {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
    </span>
  );
}
