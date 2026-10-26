// Exam mode on the server: what a session may be created with, who may start it, and when a device must wait for
// the teacher. The handlers and services call these.
import { ClientOutdated, DeviceAttestationRequired } from "@examinus/contract/attempt";
import { Forbidden } from "@examinus/contract/errors";
import {
  clientAllowed,
  clientOf,
  isOutdated,
  releasesUrl,
  type AttemptClient,
  type ClientInfo,
  type ClientKind,
} from "@examinus/domain/client";
import {
  defaultHonorPledge,
  examDefaults,
  isPhoneOrTablet,
  lockedSettingsOff,
} from "@examinus/domain/exam";
import { type ExamSettings, type IntegritySettings, type Session, type SessionMode } from "@examinus/domain/quiz";
import { Option } from "effect";
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

// Whether a phone or tablet is on a computers-only exam session (from the user agent and client hints the web app
// forwards). The mobile app is a phone by its user agent, but it is judged by `deviceRefusal` instead.
export function isPhoneRefused(mode: SessionMode, exam: ExamSettings | null, headers: Headers, client: AttemptClient): boolean {
  if (mode !== "exam" || !exam?.computersOnly || client.kind === "mobile") return false;
  return isPhoneOrTablet({
    userAgent: headers["user-agent"],
    mobileHint: headers["sec-ch-ua-mobile"],
    platform: headers["sec-ch-ua-platform"],
  });
}

export const deviceAttestationMessage = "This exam needs the Examinus app on a verified device.";

// The refusal when an exam is taken in the mobile app without the teacher allowing it, or on a device that hasn't passed
// the platform's integrity check (`client.attest`); else null. Other modes accept the mobile app; the attempt only records
// whether the device was verified.
export function deviceRefusal(mode: SessionMode, exam: ExamSettings | null, client: AttemptClient): DeviceAttestationRequired | null {
  if (mode !== "exam" || client.kind !== "mobile" || (exam?.allowMobile === true && client.attested)) return null;
  return new DeviceAttestationRequired({ message: deviceAttestationMessage });
}

// The ClientOutdated refusal when the request came from an app build older than the API requires (DESKTOP_MIN_VERSION,
// MOBILE_MIN_VERSION), else null. The browser always passes.
export function outdatedClient(
  client: AttemptClient,
  config: {
    desktop: { minVersion: string; releasesRepo: string };
    mobile: { minVersion: string; storeUrl: Option.Option<string> };
  },
): ClientOutdated | null {
  if (client.kind === "web") return null;
  const minVersion = client.kind === "desktop" ? config.desktop.minVersion : config.mobile.minVersion;
  if (!isOutdated(client.version, minVersion)) return null;
  return new ClientOutdated({
    message: `This Examinus app (${client.version}) is out of date. Update to ${minVersion} or newer to continue.`,
    version: client.version,
    minVersion,
    releasesUrl:
      client.kind === "mobile"
        ? Option.getOrElse(config.mobile.storeUrl, () => releasesUrl(config.desktop.releasesRepo))
        : releasesUrl(config.desktop.releasesRepo),
  });
}

const clientPlace: Record<ClientKind, string> = {
  web: "a web browser",
  desktop: "the Examinus Desktop app",
  mobile: "the Examinus mobile app",
};

// The Forbidden refusal when the session doesn't allow this client (web browser, desktop app or mobile app), else null.
export function wrongClient(client: AttemptClient, integrity: IntegritySettings, desktop: { releasesRepo: string }): Forbidden | null {
  if (clientAllowed(integrity.allowedClients, client.kind)) return null;
  const allowed = integrity.allowedClients ?? [];
  const message =
    client.kind === "web" && allowed.every((k) => k === "desktop")
      ? `This can only be taken in the Examinus Desktop app. Download it from ${releasesUrl(desktop.releasesRepo)} and open it there.`
      : `This can only be taken in ${allowed.map((k) => clientPlace[k]).join(" or ")}, not in ${clientPlace[client.kind]}.`;
  return new Forbidden({ message });
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
