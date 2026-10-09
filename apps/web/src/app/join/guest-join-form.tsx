"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { normalizeJoinKey } from "@examora/contract";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { joinAsGuestAction } from "./actions";

export const maxGuestName = 40;

// The key the teacher shows (or the invite link's) plus the name to play under. No account needed: the server
// makes an anonymous one, and the game opens at /play.
export function GuestJoinForm({ initialCode = "", initialName = "" }: { initialCode?: string; initialName?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ready = normalizeJoinKey(code) !== null && name.trim().length > 0;

  function join() {
    start(async () => {
      const result = await joinAsGuestAction(name.trim(), code);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/play/${result.ok.sessionId}`);
    });
  }

  return (
    <Card className="w-full max-w-md p-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          join();
        }}
        className="grid gap-4"
      >
        <Field label="Game key">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC-DEFG"
            maxLength={9}
            autoComplete="off"
            autoCapitalize="characters"
            className={`${inputClass} font-mono text-lg uppercase tracking-widest`}
          />
        </Field>
        <Field label="Your name" hint="What your teacher and the other players see.">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={maxGuestName}
            autoComplete="name"
            className={inputClass}
          />
        </Field>
        <Button type="submit" disabled={pending || !ready}>
          {pending ? "Joining…" : "Join game"}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Card>
  );
}
