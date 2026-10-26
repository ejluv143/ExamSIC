// What the player sends during a game. Each call returns the refusal's text (null when it worked), like the web's
// server actions, so a screen shows it under the button.
import type { AnswerValue } from "@examinus/domain/quiz";
import { Result, type Effect } from "effect";
import type { RpcClientError } from "effect/rpc";
import { callResult, type Api } from "@/lib/api";

type Refusal = { readonly _tag: string; readonly message?: string };

async function send(call: (api: Api) => Effect.Effect<unknown, Refusal | RpcClientError.RpcClientError>): Promise<string | null> {
  try {
    const result = await callResult(call);
    return Result.isSuccess(result) ? null : result.failure.message || "Something went wrong.";
  } catch (e) {
    return e instanceof Error ? e.message : "Something went wrong.";
  }
}

export const joinGame = (sessionId: string) => send((api) => api["game.join"]({ sessionId }));
export const answerGame = (sessionId: string, questionId: string, value: AnswerValue) => send((api) => api["game.answer"]({ sessionId, questionId, value }));
export const nextGame = (sessionId: string) => send((api) => api["game.next"]({ sessionId }));
export const pickTeam = (sessionId: string, teamId: string) => send((api) => api["game.pickTeam"]({ sessionId, teamId }));
export const retryQuestion = (sessionId: string) => send((api) => api["game.retry"]({ sessionId }));
export const claimRescue = (sessionId: string, questionId: string) => send((api) => api["game.claimRescue"]({ sessionId, questionId }));
export const answerRescue = (sessionId: string, questionId: string, value: AnswerValue) => send((api) => api["game.rescue"]({ sessionId, questionId, value }));
export const submitPassword = (sessionId: string, guess: string) => send((api) => api["game.submitPassword"]({ sessionId, guess }));
export const confirmPassword = (sessionId: string) => send((api) => api["game.confirmPassword"]({ sessionId }));
export const rejectPassword = (sessionId: string) => send((api) => api["game.rejectPassword"]({ sessionId }));
