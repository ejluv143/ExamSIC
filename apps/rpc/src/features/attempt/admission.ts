// What a student sees of a session, and whether they may enter or start it. The paper, the start and the lists all
// ask here, so the allowance they show and the order refusals come in can't differ between them.
import { ClientOutdated, ComputersOnly, DeviceAttestationRequired } from "@examinus/contract/attempt";
import { Conflict, Forbidden } from "@examinus/contract/errors";
import { applyAccommodations, type Accommodations } from "@examinus/domain/accommodations";
import { clientAllowed, isOutdated, releasesUrl, type AttemptClient, type ClientKind } from "@examinus/domain/client";
import { isPhoneOrTablet } from "@examinus/domain/exam";
import { type ExamSettings, type IntegritySettings, type Session, type SessionMode } from "@examinus/domain/quiz";
import { Effect, Option } from "effect";
import type { QuizSessionItem } from "../../database/schemas/index.ts";
import { ipAllowed } from "../../platform/network.ts";
import type { ExamRepo } from "../exam/Repo.ts";
import { toSession } from "../session/mappers.ts";
import { computersOnlyMessage, type Player } from "./rules.ts";

// A session on the student's roster with their accommodations.
export type Seat = { session: QuizSessionItem; accommodations: Accommodations | null };

type Headers = Readonly<Record<string, string | undefined>>;

// The session with the student's accommodations applied: the rules they are exempt from are off.
const accommodated = (seat: Seat, now: number): Session => applyAccommodations(toSession(seat.session, now), seat.accommodations);

// The attempts allowed include the retakes the teacher granted and the student's extra attempts.
const withAllowance = (s: Session, seat: Seat, granted: number): Session => {
  const extra = granted + (seat.accommodations?.extraAttempts ?? 0);
  return s.attemptsAllowed === null ? s : { ...s, attemptsAllowed: s.attemptsAllowed + extra };
};

// The sessions as this student sees them, by session id: with their accommodations and allowance.
export const studentViews = Effect.fn("admission.studentViews")(function* (
  examRepo: ExamRepo["Service"],
  player: Player,
  seats: readonly Seat[],
  now: number,
) {
  const granted = yield* examRepo.grantedRetakes(player.id, seats.map((s) => s.session.id));
  return new Map(seats.map((seat): [string, Session] => [seat.session.id, withAllowance(accommodated(seat, now), seat, granted.get(seat.session.id) ?? 0)]));
});

// The session as this student sees it.
export const studentView = Effect.fn("admission.studentView")(function* (examRepo: ExamRepo["Service"], player: Player, seat: Seat, now: number) {
  return (yield* studentViews(examRepo, player, [seat], now)).get(seat.session.id)!;
});

// Why this client may not take the session, else null. The order is fixed: a phone on a computers-only exam, an app
// build that is too old, a client the session doesn't allow, a mobile device the exam doesn't trust.
export function clientRefusal(
  seat: Seat,
  client: AttemptClient,
  headers: Headers,
  config: ClientConfig,
  now: number,
): ComputersOnly | ClientOutdated | Forbidden | DeviceAttestationRequired | null {
  const { session } = seat;
  const exam = accommodated(seat, now).exam;
  if (isPhoneRefused(session.mode, exam, headers, client)) return new ComputersOnly({ message: computersOnlyMessage });
  return outdatedClient(client, config) ?? wrongClient(client, session.integrity, config.desktop) ?? deviceRefusal(session.mode, exam, client);
}

// Whether a phone or tablet is on a computers-only exam session (from the user agent and client hints the web app
// forwards). The mobile app is a phone by its user agent, but it is judged by `deviceRefusal` instead.
function isPhoneRefused(mode: SessionMode, exam: ExamSettings | null, headers: Headers, client: AttemptClient): boolean {
  if (mode !== "exam" || !exam?.computersOnly || client.kind === "mobile") return false;
  return isPhoneOrTablet({
    userAgent: headers["user-agent"],
    mobileHint: headers["sec-ch-ua-mobile"],
    platform: headers["sec-ch-ua-platform"],
  });
}

const deviceAttestationMessage = "This exam needs the Examinus app on a verified device.";

// The refusal when an exam is taken in the mobile app without the teacher allowing it, or on a device that hasn't passed
// the platform's integrity check (`client.attest`); else null. Other modes accept the mobile app; the attempt only records
// whether the device was verified.
function deviceRefusal(mode: SessionMode, exam: ExamSettings | null, client: AttemptClient): DeviceAttestationRequired | null {
  if (mode !== "exam" || client.kind !== "mobile" || (exam?.allowMobile === true && client.attested)) return null;
  return new DeviceAttestationRequired({ message: deviceAttestationMessage });
}

// What the API requires of the apps: the oldest build allowed, and where each is updated.
export type ClientConfig = {
  desktop: { minVersion: string; releasesRepo: string };
  mobile: { minVersion: string; storeUrl: Option.Option<string> };
};

// The ClientOutdated refusal when the request came from an app build older than the API requires (DESKTOP_MIN_VERSION,
// MOBILE_MIN_VERSION), else null. The browser always passes.
function outdatedClient(
  client: AttemptClient,
  config: ClientConfig,
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
function wrongClient(client: AttemptClient, integrity: IntegritySettings, desktop: { releasesRepo: string }): Forbidden | null {
  if (clientAllowed(integrity.allowedClients, client.kind)) return null;
  const allowed = integrity.allowedClients ?? [];
  const message =
    client.kind === "web" && allowed.every((k) => k === "desktop")
      ? `This can only be taken in the Examinus Desktop app. Download it from ${releasesUrl(desktop.releasesRepo)} and open it there.`
      : `This can only be taken in ${allowed.map((k) => clientPlace[k]).join(" or ")}, not in ${clientPlace[client.kind]}.`;
  return new Forbidden({ message });
}

const attemptsUsedUp = (s: Session, used: number) =>
  s.attemptsAllowed !== null && used >= s.attemptsAllowed ? new Conflict({ message: "You've used all your attempts." }) : null;

// Why the student may not open the intro of a session they have no attempt in progress in, else null. The lobby is
// open to them: arriving there shows the teacher who is in.
export function introRefusal(s: Session, used: number): Conflict | null {
  if (s.status !== "lobby" && s.status !== "running") return new Conflict({ message: "This session isn't open." });
  return attemptsUsedUp(s, used);
}

// Why the student may not start a new attempt, else null. The order is fixed: the session must be running, attempts
// left, the honor pledge (exams), the late-join window, the room password, the network.
export function startRefusal(
  s: Session,
  session: QuizSessionItem,
  input: { used: number; pledgeAccepted: boolean | undefined; roomPassword: string | undefined; ip: string | null; now: number },
): Conflict | Forbidden | null {
  if (s.status !== "running")
    return new Conflict({ message: s.status === "lobby" ? "The session hasn't started yet. Wait in the lobby." : "This session isn't open." });
  const used = attemptsUsedUp(s, input.used);
  if (used) return used;
  if (session.mode === "exam" && input.pledgeAccepted !== true)
    return new Conflict({ message: "Accept the honor pledge before you start the exam." });
  if (session.lateJoinMinutes !== null && s.startedAt !== null && input.now > Date.parse(s.startedAt) + session.lateJoinMinutes * 60_000)
    return new Conflict({ message: `It's too late to join: students could start in the first ${session.lateJoinMinutes} minutes.` });
  if (session.roomPassword !== null && (input.roomPassword ?? "").trim() !== session.roomPassword)
    return new Forbidden({ message: "That room password isn't right." });
  if (!ipAllowed(input.ip, session.ipAllowlist)) return new Forbidden({ message: "This isn't on the network allowed for this session." });
  return null;
}
