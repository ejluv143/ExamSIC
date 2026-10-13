"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

// A labelled value (join key, room password) that copies itself on click.
export function CopyChip({ label, value, display }: { label: string; value: string; display?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()} ${display ?? value}`}
      title={`Copy the ${label.toLowerCase()}`}
      className="group inline-flex items-center gap-2 rounded-lg border border-dashed border-border bg-surface px-3 py-1.5 hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span className="text-xs text-muted">{label}</span>
      <span className="font-mono text-base font-semibold tracking-widest group-hover:text-primary">{display ?? value}</span>
      {copied ? (
        <Check className="size-3.5 text-success" aria-hidden />
      ) : (
        <Copy className="size-3.5 text-muted group-hover:text-primary" aria-hidden />
      )}
    </button>
  );
}
