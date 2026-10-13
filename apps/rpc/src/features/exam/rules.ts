// Exam mode on the server: what a session may be created with, who may start it, and when a device must wait for
// the teacher. The handlers and services call these.
import {
  computersOnlyMessage,
  defaultHonorPledge,
  examDefaults,
  isPhoneOrTablet,
  lockedSettingsOff,
} from "@examinus/domain/exam";
import { type ExamSettings, type IntegritySettings, type Session, type SessionMode } from "@examinus/domain/quiz";

type Headers = Readonly<Record<string, string | undefined>>;

// The exam settings to store: required for exam sessions, null for every other mode.
export function examColumn(mode: SessionMode, exam: ExamSettings | null): ExamSettings | null {
  if (mode !== "exam") return null;
  return (
    exam ?? {
      computersOnly: examDefaults.computersOnly,
      honorPledge: defaultHonorPledge,
      deviceGraceMinutes: examDefaults.deviceGraceMinutes,
    }
  );
}

// A message when an exam session is missing a locked setting, else null. Turning a locked setting off is refused.
export function examSettingsProblem(mode: SessionMode, integrity: IntegritySettings): string | null {
  if (mode !== "exam") return null;
  const off = lockedSettingsOff(integrity);
  return off.length === 0 ? null : `Exams need these settings on: ${off.map((l) => l.toLowerCase()).join(", ")}.`;
}

// The refusal for a phone or tablet on a computers-only exam session (from the user agent and client hints the
// web app forwards), else null.
export function phoneRefusal(mode: SessionMode, exam: ExamSettings | null, headers: Headers): string | null {
  if (mode !== "exam" || !exam?.computersOnly) return null;
  const phone = isPhoneOrTablet({
    userAgent: headers["user-agent"],
    mobileHint: headers["sec-ch-ua-mobile"],
    platform: headers["sec-ch-ua-platform"],
  });
  return phone ? computersOnlyMessage : null;
}

// An exam attempt may resume without the teacher only on its own device and within the grace period after its
// last check-in. `lastSeen` null: never checked in, treated as fresh.
export function withinGrace(exam: ExamSettings | null, lastSeen: Date | null, now: Date): boolean {
  if (lastSeen === null) return true;
  const graceMinutes = exam?.deviceGraceMinutes ?? examDefaults.deviceGraceMinutes;
  return now.getTime() - lastSeen.getTime() <= graceMinutes * 60_000;
}

// The session as one student sees it: the attempts allowed include the retakes granted to them.
export const withAllowance = (s: Session, granted: number): Session =>
  s.attemptsAllowed === null ? s : { ...s, attemptsAllowed: s.attemptsAllowed + granted };
