// `TakeMode` (packages/taking) over the bearer RPC: what the web's server actions do for the browser. Every call
// carries the hardware `deviceId` so the API ties the attempt to this phone. A call that can't reach the server
// throws (the paper's saving queue then keeps the answer and tries again); a refusal comes back as a message, and the
// refusals that have a screen of their own (waiting for approval, computers only, blocked, outdated) go to `onRefusal`.
import { refusalScreen } from "@examinus/copy/errors";
import type { ClientInfo } from "@examinus/domain/client";
import type { AnswerValue, IntegrityEvent, TypingEdits } from "@examinus/domain/quiz";
import type { RunCode, TakeMode } from "@examinus/taking/types";
import { Result, type Effect } from "effect";
import type { RpcClientError } from "effect/rpc";
import { callResult, type Api } from "@/lib/api";
import { pendingSaves } from "./offline-queue";

// A declared refusal of the API: its tag, the message written for people and (outdated app) where to update.
export type Refusal = { tag: string; message: string; releasesUrl?: string };

type Failure = { readonly _tag: string; readonly message?: string; readonly releasesUrl?: string };
export const refusalOf = (failure: Failure): Refusal => ({
  tag: failure._tag,
  message: failure.message ?? (failure._tag === "NotFound" ? "That no longer exists." : "You can't do that."),
  ...(failure.releasesUrl === undefined ? {} : { releasesUrl: failure.releasesUrl }),
});

// A refusal with a screen of its own, or one that ends the attempt's time; the rest is only a message.
const hasScreen = (tag: string) => refusalScreen(tag) !== null && tag !== "Forbidden" && tag !== "OpenElsewhere";

export function makeRpcTakeMode({
  sessionId,
  attemptId,
  deviceId,
  client,
  watermark,
  codeRunner,
  onRefusal,
  onStarted,
  onMoved,
  onReload,
  onSubmitted,
  onLate,
}: {
  sessionId: string;
  attemptId: string | undefined;
  deviceId: () => Promise<string>;
  client: ClientInfo;
  watermark: string;
  codeRunner: boolean;
  // A refusal with a screen of its own, mid-attempt or at the start.
  onRefusal: (refusal: Refusal) => void;
  // The attempt started or the server moved to another question: read the paper again.
  onStarted: () => void;
  onMoved: () => void;
  onReload: () => void;
  onSubmitted: () => void;
  // The server no longer takes answers (time is up): says so to the student.
  onLate: (message: string) => void;
}): TakeMode {
  // Runs a call; returns the failure's refusal, or null when it worked. Transport failures throw.
  async function run<A, E extends Failure>(call: (api: Api) => Effect.Effect<A, E | RpcClientError.RpcClientError>): Promise<{ value: A; refusal: null } | { value?: undefined; refusal: Refusal }> {
    const result = await callResult(call);
    return Result.isSuccess(result) ? { value: result.success, refusal: null } : { refusal: refusalOf(result.failure) };
  }
  const message = (refusal: Refusal): string => {
    if (hasScreen(refusal.tag)) onRefusal(refusal);
    return refusal.message;
  };
  const needAttempt = "This attempt hasn't started.";

  return {
    onStart: async (roomPassword) => {
      const device = await deviceId();
      const started = await run((api) =>
        api["attempt.start"]({
          sessionId,
          deviceId: device,
          client,
          ...(roomPassword ? { roomPassword } : {}),
        }),
      );
      if (started.refusal !== null) return message(started.refusal);
      onStarted();
      return null;
    },

    onSave: async (questionId, value: AnswerValue, typing?: TypingEdits, timeSpentMs?: number) => {
      if (!attemptId) return needAttempt;
      const device = await deviceId();
      let outcome;
      try {
        outcome = await run((api) =>
          api["attempt.saveAnswer"]({
            attemptId,
            deviceId: device,
            questionId,
            value,
            ...(typing ? { typing } : {}),
            ...(timeSpentMs === undefined ? {} : { timeSpentMs }),
          }),
        );
      } catch (offline) {
        // Kept on the phone until the server has it (see `flushPending`), and the saving queue tries again.
        await pendingSaves.put(attemptId, questionId, { value, ...(typing ? { typing } : {}), ...(timeSpentMs === undefined ? {} : { timeSpentMs }) });
        throw offline;
      }
      if (outcome.refusal !== null) {
        // The server won't take it (time is up, or the attempt is over): nothing to keep, and the student is told.
        await pendingSaves.settle(attemptId, questionId, value);
        if (outcome.refusal.tag === "Conflict") onLate(outcome.refusal.message);
        return message(outcome.refusal);
      }
      await pendingSaves.settle(attemptId, questionId, value);
      return null;
    },

    onEvents: async (events: IntegrityEvent[]) => {
      if (!attemptId) return null;
      const device = await deviceId();
      const recorded = await run((api) => api["attempt.recordEvents"]({ attemptId, deviceId: device, events }));
      return recorded.refusal !== null ? message(recorded.refusal) : null;
    },

    onHeartbeat: async () => {
      if (!attemptId) return null;
      const device = await deviceId();
      const beat = await run((api) => api["attempt.heartbeat"]({ attemptId, deviceId: device }));
      return beat.refusal !== null ? message(beat.refusal) : null;
    },

    onGoTo: async (index) => {
      if (!attemptId) return needAttempt;
      const device = await deviceId();
      const moved = await run((api) => api["attempt.goTo"]({ attemptId, deviceId: device, index }));
      if (moved.refusal !== null) return message(moved.refusal);
      // The question is only sent once the server has moved.
      onMoved();
      return null;
    },

    onReload: onReload,

    onMark: async (questionId, marked) => {
      if (!attemptId) return needAttempt;
      const device = await deviceId();
      const done = await run((api) => api["attempt.setMarked"]({ attemptId, deviceId: device, questionId, marked }));
      return done.refusal !== null ? message(done.refusal) : null;
    },

    onSubmit: async (answers, events, typing) => {
      if (!attemptId) return needAttempt;
      const device = await deviceId();
      const submitted = await run((api) =>
        api["attempt.submit"]({ attemptId, deviceId: device, answers, events, typing }),
      );
      if (submitted.refusal !== null) return message(submitted.refusal);
      await pendingSaves.clear(attemptId);
      onSubmitted();
      return null;
    },

    watermark,

    ...(codeRunner && attemptId
      ? {
          runCode: (async (questionId, code) => {
            const ran = await run((api) => api["attempt.runSampleTests"]({ attemptId, questionId, code }));
            return ran.refusal !== null ? { error: ran.refusal.message } : { ok: ran.value };
          }) satisfies RunCode,
        }
      : {}),
  };
}

// Sends the answers kept on the phone (see ./offline-queue.ts) now that the network may be back. Returns how many the
// server took, and the message of a refusal (time is up) if there was one. Stops quietly while the server is unreachable.
export async function flushPending(attemptId: string, deviceId: string): Promise<{ sent: number; refused: string | null; offline: boolean }> {
  const saves = await pendingSaves.load(attemptId);
  let sent = 0;
  for (const [questionId, save] of Object.entries(saves)) {
    let outcome;
    try {
      outcome = await callResult((api) =>
        api["attempt.saveAnswer"]({
          attemptId,
          deviceId,
          questionId,
          value: save.value,
          ...(save.typing ? { typing: save.typing } : {}),
          ...(save.timeSpentMs === undefined ? {} : { timeSpentMs: save.timeSpentMs }),
        }),
      );
    } catch {
      return { sent, refused: null, offline: true };
    }
    await pendingSaves.settle(attemptId, questionId, save.value);
    if (Result.isFailure(outcome)) return { sent, refused: refusalOf(outcome.failure).message, offline: false };
    sent++;
  }
  return { sent, refused: null, offline: false };
}

