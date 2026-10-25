// Proving this phone to the API before an attempt opens: `client.nonce`, the platform's proof over it (Play Integrity,
// App Attest), `client.attest`. The result goes to `attempt.paper` and `attempt.start` as `attestation`. A phone that
// can't be proven still opens quizzes; an exam that needs it is refused by the API with `DeviceAttestationRequired`.
// The signs of a rooted or emulated device (hints) are recorded as integrity events once the attempt exists.
import type { IntegrityEvent } from "@examinus/domain/quiz";
import { Result } from "effect";
import { Platform } from "react-native";
import { deviceHints, type DeviceHint } from "../../modules/examinus-attest";
import { callResult } from "./api";
import { storage } from "./storage";
import { mobilePlatform } from "@/platform/mobile-platform";

export type DeviceProof = {
  // The API's signed claim for this device, or null when it couldn't be proven.
  attestation: string | null;
  // Why not, in words for the person, when the platform or the API said no.
  rejected: string | null;
  hints: DeviceHint[];
};

const rejectedTtlMs = 2 * 60_000;
const refreshMarginMs = 60_000;

let cached: { proof: DeviceProof; until: number } | null = null;
let inFlight: Promise<DeviceProof> | null = null;

async function prove(): Promise<{ proof: DeviceProof; until: number }> {
  const hints = deviceHints();
  const none = (rejected: string | null, ttl: number) => ({ proof: { attestation: null, rejected, hints }, until: Date.now() + ttl });
  if (Platform.OS === "web") return none(null, Number.POSITIVE_INFINITY);
  try {
    const challenge = await callResult((api) => api["client.nonce"]());
    if (Result.isFailure(challenge)) return none(challenge.failure.message ?? "This device couldn't be checked.", rejectedTtlMs);
    const { nonce } = challenge.success;
    let proof;
    try {
      proof = await mobilePlatform.attest(nonce);
    } catch (e) {
      // The native module's error wraps the cause ("... has been rejected. → Caused by: <reason>"): show the reason.
      const reason = e instanceof Error ? (e.message.split("Caused by:").pop()?.trim() ?? e.message) : "";
      return none(reason || "This device couldn't be checked.", rejectedTtlMs);
    }
    if (proof === null) return none(null, rejectedTtlMs);
    const deviceId = await mobilePlatform.deviceId();
    const attested = await callResult((api) =>
      api["client.attest"]({ nonce, platform: proof.platform, token: proof.token, deviceId, ...(proof.keyId === undefined ? {} : { keyId: proof.keyId }) }),
    );
    if (Result.isFailure(attested)) return none(attested.failure.message ?? "This device didn't pass the check.", rejectedTtlMs);
    const expires = Date.parse(attested.success.expiresAt);
    return { proof: { attestation: attested.success.attestation, rejected: null, hints }, until: expires - refreshMarginMs };
  } catch {
    // The server couldn't be reached: carry on without, and try again next time.
    return { proof: { attestation: null, rejected: null, hints }, until: 0 };
  }
}

// The proof for this device, kept until shortly before the attestation expires (a failed try is kept two minutes, so a
// screen that opens the paper again and again doesn't call Google each time).
export async function deviceProof(): Promise<DeviceProof> {
  if (cached !== null && cached.until > Date.now()) return cached.proof;
  inFlight ??= prove()
    .then((made) => {
      cached = made;
      return made.proof;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

const hintsKey = (attemptId: string) => `examinus_hints_${attemptId}`;

// Records the hints as integrity events (`rooted_device`, `emulator`) once per attempt, so the teacher's report shows
// them. Quiet when the server can't be reached: the next time the paper opens tries again.
export async function recordDeviceHints(attemptId: string): Promise<void> {
  const { hints } = await deviceProof();
  if (hints.length === 0 || (await storage.get(hintsKey(attemptId))) !== null) return;
  const at = new Date().toISOString();
  const events: IntegrityEvent[] = hints.map((type) => ({ type, at }));
  try {
    const deviceId = await mobilePlatform.deviceId();
    const done = await callResult((api) => api["attempt.recordEvents"]({ attemptId, deviceId, events }));
    if (Result.isSuccess(done)) await storage.set(hintsKey(attemptId), "1");
  } catch {
    // Unreachable: tried again when the paper next opens.
  }
}
