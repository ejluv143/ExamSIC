"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { normalizeJoinKey } from "@examora/contract";
import { Button, Card, inputClass } from "@/components/ui";
import { findByCodeAction } from "@/lib/game/actions";

// The 7-character key the teacher shows opens the session: a game takes the student to its lobby, any other session
// to its usual page. Case, spaces and dashes don't matter; a session without a class adds the student to it.
export function JoinForm({ initialCode = "", compact = false }: { initialCode?: string; compact?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function join() {
    start(async () => {
      const result = await findByCodeAction(code);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const found = result.ok;
      router.push(found.mode === "game" ? `/student/game/${found.sessionId}` : `/student/assessments/${found.sessionId}`);
    });
  }

  const form = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        join();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        aria-label="Join key (7 characters)"
        placeholder="ABC-DEFG"
        maxLength={9}
        autoComplete="off"
        autoCapitalize="characters"
        className={`${inputClass} w-44 font-mono text-lg uppercase tracking-widest`}
      />
      <Button type="submit" disabled={pending || normalizeJoinKey(code) === null}>
        Join
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
  return compact ? form : <Card className="max-w-lg p-6">{form}</Card>;
}
