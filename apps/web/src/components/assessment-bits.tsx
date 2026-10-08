import type { SessionMode } from "@examora/contract";
import { statusLabel, statusTone } from "@/lib/format";
import { modeLabel } from "@/lib/sessions";
import type { QuizStatus } from "@/lib/types";
import { Badge } from "./ui";

export function StatusBadge({ status }: { status: QuizStatus }) {
  return <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>;
}

export function ModeBadge({ mode }: { mode: SessionMode }) {
  return <Badge tone={mode === "exam" ? "primary" : "neutral"}>{modeLabel(mode)}</Badge>;
}
