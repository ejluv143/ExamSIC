import type { Assessment } from "@/lib/types";
import { statusLabel, statusTone } from "@/lib/format";
import { Badge } from "./ui";

export function StatusBadge({ status }: { status: Assessment["status"] }) {
  return <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>;
}

export function KindBadge({ kind }: { kind: Assessment["kind"] }) {
  return <Badge tone={kind === "exam" ? "primary" : "neutral"}>{kind === "exam" ? "Exam" : "Quiz"}</Badge>;
}
