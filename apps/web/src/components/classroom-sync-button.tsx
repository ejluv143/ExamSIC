"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "./ui";

// Pulls new students from the class's Google Classroom course.
export function ClassroomSyncButton({
  sync,
  label = "Sync roster",
}: {
  sync: () => Promise<{ ok: string } | { error: string }>;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: string } | { error: string } | null>(null);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await sync()))}
      >
        <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} aria-hidden />
        {pending ? "Syncing…" : label}
      </Button>
      {result && (
        <span role="status" className={"error" in result ? "text-xs text-danger" : "text-xs text-muted"}>
          {"error" in result ? result.error : result.ok}
        </span>
      )}
    </span>
  );
}
