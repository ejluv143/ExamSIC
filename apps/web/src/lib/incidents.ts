// What the teacher did during a session, as one line for the live view and the exam report.
import type { Incident } from "@examora/contract";
import { formatDuration } from "./integrity";

const minutes = (seconds: number | null) => {
  const m = Math.round((seconds ?? 0) / 60);
  return `${m} ${m === 1 ? "minute" : "minutes"}`;
};

// One line for an action the teacher took. `name` is the student it was aimed at, null for the whole session.
export function incidentText(incident: Incident, name: string | null): string {
  const who = name ?? "everyone";
  switch (incident.kind) {
    case "pause":
      return "Paused the session";
    case "resume":
      return incident.seconds ? `Resumed the session after ${formatDuration(incident.seconds * 1000)}` : "Resumed the session";
    case "add_time":
      return `Added ${minutes(incident.seconds)} for ${who}`;
    case "warn":
      return `Warned ${who}${incident.message ? `: “${incident.message}”` : ""}`;
    case "lock":
      return `Locked ${who}'s screen`;
    case "unlock":
      return `Unlocked ${who}'s screen`;
    case "force_submit":
      return `Submitted ${who}'s attempt`;
    case "allow_back_in":
      return `Let ${who} back in`;
    case "device_switch_allowed":
      return `Approved ${who}'s device switch`;
    case "retake_granted":
      return `Granted ${who} a retake${incident.message ? `: “${incident.message}”` : ""}`;
  }
}
