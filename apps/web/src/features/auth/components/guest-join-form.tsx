"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { normalizeJoinKey } from "@examinus/domain/join-key";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { joinAsGuestAction } from "../actions";
import { enterFullscreen, leaveFullscreen } from "@/lib/fullscreen";

export const maxGuestName = 40;

// The key the teacher shows (or the invite link's) plus the name to take it under. No account needed: the server
// makes an anonymous one, and the session opens at /play (a game) or /play/…/take (a quiz or exam), in full screen
// (the Join click allows it).
export function GuestJoinForm({ initialCode = "", initialName = "" }: { initialCode?: string; initialName?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ready = normalizeJoinKey(code) !== null && name.trim().length > 0;

  function join() {
    void enterFullscreen();
    start(async () => {
      const result = await joinAsGuestAction(name.trim(), code);
      if ("error" in result) {
        leaveFullscreen();
        setError(result.error);
        return;
      }
      const { sessionId, mode } = result.ok;
      router.push(mode === "game" ? `/play/${sessionId}` : `/play/${sessionId}/take`);
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
        <Field label="Join key">
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
        <Field label="Your name" hint="What your teacher and the others see.">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={maxGuestName}
            autoComplete="name"
            className={inputClass}
          />
        </Field>
        <Button type="submit" disabled={pending || !ready}>
          {pending ? "Joining…" : "Join"}
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
