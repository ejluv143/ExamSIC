"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { aiLimits, aiProviderLabels, aiProviders, defaultAiModels } from "@examora/contract";
import type { AiKeyInfo, AiKeyScope, AiProvider } from "@examora/contract";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";
import { removeAiKeyAction, saveAiKeyAction } from "@/lib/ai/actions";
import { formatDateTime } from "@/lib/format";

// One card per provider: the saved key (only its last four characters), and a form to add or replace it, change
// its model or remove it. The key field is never filled in.
export function AiKeyManager({ scope, keys }: { scope: AiKeyScope; keys: readonly AiKeyInfo[] }) {
  return (
    <div className="grid max-w-3xl gap-4">
      {aiProviders.map((provider) => (
        <ProviderKey key={provider} scope={scope} provider={provider} saved={keys.find((k) => k.provider === provider)} />
      ))}
    </div>
  );
}

function ProviderKey({ scope, provider, saved }: { scope: AiKeyScope; provider: AiProvider; saved?: AiKeyInfo }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(saved?.model ?? "");
  const [message, setMessage] = useState<{ error: string } | { saved: string } | null>(null);
  const label = aiProviderLabels[provider];

  function save() {
    startTransition(async () => {
      const result = await saveAiKeyAction(scope, provider, model, apiKey);
      if ("error" in result) {
        setMessage({ error: result.error });
        return;
      }
      setApiKey("");
      setModel(result.ok.model);
      setMessage({ saved: apiKey ? `${label} key saved.` : `${label} model changed.` });
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`Remove the ${label} key?`)) return;
    startTransition(async () => {
      const result = await removeAiKeyAction(scope, provider);
      if ("error" in result) {
        setMessage({ error: result.error });
        return;
      }
      setApiKey("");
      setModel("");
      setMessage({ saved: `${label} key removed.` });
      router.refresh();
    });
  }

  return (
    <Card className="p-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!apiKey.trim() && !saved) {
            setMessage({ error: "Paste the API key." });
            return;
          }
          save();
        }}
        className="space-y-4"
        noValidate
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{label}</h2>
          {saved ? (
            <Badge tone="success">
              Key ending {saved.last4} · {saved.model}
            </Badge>
          ) : (
            <Badge>No key saved</Badge>
          )}
        </div>
        {saved && <p className="text-xs text-muted">Saved {formatDateTime(saved.updatedAt)}. The key itself can&apos;t be shown again.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={saved ? "Replace key" : "API key"} hint={saved ? "Leave empty to keep the saved key." : undefined}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              maxLength={aiLimits.maxApiKey}
              className={inputClass}
            />
          </Field>
          <Field label="Model" hint="Leave empty for the default.">
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={defaultAiModels[provider]}
              maxLength={aiLimits.maxModel}
              spellCheck={false}
              className={inputClass}
            />
          </Field>
        </div>
        {message &&
          ("error" in message ? (
            <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
              {message.error}
            </p>
          ) : (
            <p role="status" className="rounded-lg bg-success-soft p-3 text-sm text-success">
              {message.saved}
            </p>
          ))}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : saved ? (apiKey.trim() ? "Replace key" : "Save model") : "Save key"}
          </Button>
          {saved && (
            <Button type="button" variant="danger" disabled={pending} onClick={remove}>
              Remove key
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
