// `TakeMode` (packages/taking) over the bearer RPC: what the web's server actions do for the browser. Every call
// carries the hardware `deviceId` so the API ties the attempt to this phone. A call that can't reach the server
// throws (the taking flow then keeps the answer and tries again); a refusal comes back as a message, and the
// refusals that have a screen of their own (waiting for approval, computers only, blocked, outdated) go to `onRefusal`.
import { refusalScreen } from "@examinus/copy/errors";
import type { ClientInfo } from "@examinus/domain/client";
import type { AnswerValue, IntegrityEvent, TypingEdits } from "@examinus/domain/quiz";
import type { RunCode, TakeMode } from "@examinus/taking/types";
import { Result, type Effect } from "effect";
import type { RpcClientError } from "effect/rpc";
import { callResult, type Api } from "@/lib/api";
import { deviceProof } from "@/lib/attestation";

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
  exam,
  onRefusal,
  onStarted,
  onMoved,
  onReload,
  onSubmitted,
}: {
  sessionId: string;
  attemptId: string | undefined;
  deviceId: () => Promise<string>;
  client: ClientInfo;
  watermark: string;
  codeRunner: boolean;
  // An exam: the student accepted the honor pledge on the gate before Start (the API requires it), so Start says so.
  exam: boolean;
  // A refusal with a screen of its own, mid-attempt or at the start.
  onRefusal: (refusal: Refusal) => void;
  // The attempt started or the server moved to another question: read the paper again.
  onStarted: () => void;
  onMoved: () => void;
  onReload: () => void;
  onSubmitted: () => void;
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
      const { attestation } = await deviceProof();
      const started = await run((api) =>
        api["attempt.start"]({
          sessionId,
          deviceId: device,
          client,
          ...(exam ? { pledgeAccepted: true } : {}),
          ...(attestation === null ? {} : { attestation }),
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
      const saved = await run((api) =>
        api["attempt.saveAnswer"]({
          attemptId,
          deviceId: device,
          questionId,
          value,
          ...(typing ? { typing } : {}),
          ...(timeSpentMs === undefined ? {} : { timeSpentMs }),
        }),
      );
      return saved.refusal !== null ? message(saved.refusal) : null;
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
