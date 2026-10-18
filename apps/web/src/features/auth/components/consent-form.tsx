"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui";

// What each OAuth scope lets the client have, besides acting as the teacher through the MCP server.
const scopeLabels: Record<string, string> = {
  openid: "Know which Examinus account is yours",
  profile: "See your name",
  email: "See your email address",
  offline_access: "Stay connected until you sign it out",
};

// Allow or deny an MCP client. Both answers go to Better Auth's consent endpoint (proxied at /api/auth) with the
// signed authorization request, and the browser follows the redirect it returns: back to the client, with a code or
// the refusal.
export function ConsentForm({ clientId, scope }: { clientId: string; scope: string }) {
  const [clientName, setClientName] = useState<string | null>(null);
  const [pending, setPending] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`, { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((client: { client_name?: unknown } | null) => {
        if (typeof client?.client_name === "string") setClientName(client.client_name);
      })
      .catch(() => {});
  }, [clientId]);

  async function answer(accept: boolean) {
    setPending(accept ? "allow" : "deny");
    setError(null);
    const res = await fetch("/api/auth/oauth2/consent", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accept, oauth_query: window.location.search.slice(1) }),
    }).catch(() => null);
    const body: { url?: unknown } | null = res?.ok ? await res.json() : null;
    if (typeof body?.url === "string") {
      window.location.href = body.url;
      return;
    }
    setPending(null);
    setError("This request has expired or isn't valid. Start connecting again from your assistant.");
  }

  const scopes = scope.split(" ").filter((s) => s in scopeLabels);
  return (
    <div>
      <h1 className="font-display text-2xl font-bold tracking-tight">Allow access</h1>
      <p className="mt-2 text-sm">
        <span className="font-semibold">{clientName ?? "An AI assistant"}</span> wants to use Examinus as you: create
        quizzes and questions, and read your classes, sessions and results.
      </p>
      {scopes.length > 0 && (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted">
          {scopes.map((s) => (
            <li key={s}>{scopeLabels[s]}</li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-6 flex gap-3">
        <Button variant="secondary" className="flex-1 py-2.5" disabled={pending !== null} onClick={() => answer(false)}>
          {pending === "deny" && <Loader2 className="size-4 animate-spin" aria-hidden />} Deny
        </Button>
        <Button className="flex-1 py-2.5" disabled={pending !== null} onClick={() => answer(true)}>
          {pending === "allow" && <Loader2 className="size-4 animate-spin" aria-hidden />} Allow
        </Button>
      </div>
    </div>
  );
}
