"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { markDropped } from "./actions";

// Dropping is an official action, so the teacher confirms it instead of it happening on its own.
export function DropButton({ classId, studentId, name }: { classId: string; studentId: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <Button
        variant="secondary"
        className="px-2.5 py-1 text-xs text-danger"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(`Mark ${name} as dropped (DR) in the class record?`)) return;
          setBusy(true);
          setError(await markDropped(classId, studentId));
          setBusy(false);
        }}
      >
        {busy ? "Marking…" : "Mark as dropped"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
