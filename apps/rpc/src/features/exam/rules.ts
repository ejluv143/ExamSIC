// Exam mode on the server: what a session may be created with, and which client a request comes from (the student's
// admission, `attempt/admission.ts`, decides which clients may take a session). The handlers and services call these.
import {
  clientOf,
  type AttemptClient,
  type ClientInfo,
  type ClientKind,
} from "@examinus/domain/client";
import {
  defaultHonorPledge,
  examDefaults,
  lockedSettingsOff,
} from "@examinus/domain/exam";
import { type ExamSettings, type IntegritySettings, type SessionMode } from "@examinus/domain/quiz";
import type { AttestationClaims } from "../client/rules.ts";

type Headers = Readonly<Record<string, string | undefined>>;

// The exam settings to store: required for exam sessions, null for every other mode.
export function examColumn(mode: SessionMode, exam: ExamSettings | null): ExamSettings | null {
  if (mode !== "exam") return null;
  return (
    exam ?? {
      computersOnly: examDefaults.computersOnly,
      honorPledge: defaultHonorPledge,
      deviceGraceMinutes: examDefaults.deviceGraceMinutes,
      allowMobile: false,
    }
  );
}

// A message when an exam session is missing a locked setting, else null. Turning a locked setting off is refused.
export function examSettingsProblem(mode: SessionMode, integrity: IntegritySettings): string | null {
  if (mode !== "exam") return null;
  const off = lockedSettingsOff(integrity);
  return off.length === 0 ? null : `Exams need these settings on: ${off.map((l) => l.toLowerCase()).join(", ")}.`;
}

// The client this request comes from. The desktop app is told apart by its user agent alone; the mobile app only when
// the payload says so and the user agent is the app's (`ExaminusMobile/<semver>`); everything else is a browser. The
// version is the user agent's, the platform what the app reported (a short label, or the kind's default). `attestation`:
// the claims of a valid `client.attest` result for this user and device; it counts when it was made for this kind of app.
export function resolveClient(
  declared: ClientInfo | undefined,
  headers: Headers,
  attestation: AttestationClaims | undefined,
): AttemptClient {
  const seen = clientOf(headers["user-agent"]);
  const kind: ClientKind = seen.kind === "mobile" && declared?.kind !== "mobile" ? "web" : seen.kind;
  const reported = declared?.kind === kind ? declared.platform.trim() : "";
  const fallback = { web: "browser", desktop: "desktop", mobile: "mobile" }[kind];
  return {
    kind,
    version: seen.kind === kind && seen.kind !== "web" ? seen.version : "",
    platform: /^[\w .-]{1,40}$/.test(reported) ? reported : fallback,
    attested: attestation !== undefined && attestation.kind === kind,
  };
}
