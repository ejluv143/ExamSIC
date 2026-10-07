"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "./ui";

// Pulls courses and rosters from Google Classroom.
export function ClassroomSyncButton({ label = "Sync with Google Classroom" }: { label?: string }) {
  const [state, setState] = useState<"idle" | "syncing" | "done">("idle");

  async function sync() {
    setState("syncing");
    // TODO: call the API's Google Classroom sync once apps/rpc exists, then refresh the page.
    await new Promise((r) => setTimeout(r, 800));
    setState("done");
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={sync} disabled={state === "syncing"}>
        <RefreshCw className={state === "syncing" ? "size-4 animate-spin" : "size-4"} aria-hidden />
        {state === "syncing" ? "Syncing…" : label}
      </Button>
      {state === "done" && (
        <span role="status" className="text-xs text-muted">
          Demo only. Real syncing needs the API.
        </span>
      )}
    </span>
  );
}
