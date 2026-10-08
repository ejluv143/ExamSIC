"use client";

import { useActionState, useState } from "react";
import { Check, Copy, RefreshCw, UserMinus } from "lucide-react";
import { Button } from "@/components/ui";
import type { ClassFormState } from "../actions";

type Action = () => Promise<ClassFormState>;

function ErrorText({ state }: { state: ClassFormState }) {
  return state?.error ? (
    <p role="alert" className="text-sm text-danger">
      {state.error}
    </p>
  ) : null;
}

// The class code, big enough to read off a projector, with copy and "new code".
export function JoinCode({ code, newCode }: { code: string; newCode: Action }) {
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState(newCode, undefined);
  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="space-y-3">
      <p className="font-mono text-3xl font-semibold tracking-[0.2em] text-primary">{code}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={copy}>
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copied" : "Copy code"}
        </Button>
        <form
          action={action}
          onSubmit={(e) => {
            if (!confirm("Make a new code? The current one stops working.")) e.preventDefault();
          }}
        >
          <Button type="submit" variant="ghost" disabled={pending}>
            <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} aria-hidden /> New code
          </Button>
        </form>
      </div>
      <ErrorText state={state} />
    </div>
  );
}

export function RemoveStudentButton({ name, remove }: { name: string; remove: Action }) {
  const [state, action, pending] = useActionState(remove, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Remove ${name} from this class? Their submitted work stays.`)) e.preventDefault();
      }}
    >
      <Button type="submit" variant="danger" className="px-2 py-1" disabled={pending} aria-label={`Remove ${name}`}>
        <UserMinus className="size-4" aria-hidden />
      </Button>
      <ErrorText state={state} />
    </form>
  );
}

export function ArchiveClassButton({ action: archive }: { action: Action }) {
  const [state, action, pending] = useActionState(archive, undefined);
  return (
    <form
      action={action}
      className="space-y-3"
      onSubmit={(e) => {
        if (!confirm("Archive this class?")) e.preventDefault();
      }}
    >
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? "Archiving…" : "Archive class"}
      </Button>
      <ErrorText state={state} />
    </form>
  );
}
