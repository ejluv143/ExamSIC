"use client";
// The browser's side of the live WebSocket: follows one stream, asking for a fresh ticket on every (re)connect
// and backing off between attempts. Tickets are single use, so a dropped connection can never reuse one.
import {
  LiveRpcs,
  liveTicketHeader,
  type GameView,
  type LiveStudentEvent,
  type LiveTeacherEvent,
  type TicketTarget,
} from "@examora/contract";
import { Effect, Layer, Result, Stream } from "effect";
import { RpcClient, RpcSerialization, type RpcClientError } from "effect/rpc";
import { Socket } from "effect/socket";
import { liveTicketAction } from "./actions";

export type LiveStatus = "connecting" | "live" | "reconnecting" | "closed";

const maxBackoffMs = 15_000;

function follow<E>(
  target: TicketTarget,
  open: (client: RpcClient.FromGroup<typeof LiveRpcs, RpcClientError.RpcClientError>) => Stream.Stream<E, unknown>,
  handlers: { onEvent: (event: E) => void; onStatus: (status: LiveStatus, message?: string) => void },
): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
    });

  const connection = (url: string, ticket: string, onFirst: () => void) => {
    const sockets = Socket.layerWebSocket(url).pipe(Layer.provide(Socket.layerWebSocketConstructorGlobal));
    const protocol = RpcClient.layerProtocolSocket({ retryTransientErrors: false }).pipe(
      Layer.provide([sockets, RpcSerialization.layerJson]),
    );
    return Effect.scoped(
      Effect.gen(function* () {
        const client = yield* RpcClient.make(LiveRpcs);
        let first = true;
        yield* open(client).pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => {
              if (first) {
                first = false;
                onFirst();
              }
              handlers.onEvent(event);
            }),
          ),
          RpcClient.withHeaders({ [liveTicketHeader]: ticket }),
        );
      }),
    ).pipe(Effect.provide(protocol), Effect.result);
  };

  void (async () => {
    let failures = 0;
    while (!signal.aborted) {
      handlers.onStatus(failures === 0 ? "connecting" : "reconnecting");
      const issued = await liveTicketAction(target).catch(() => null);
      if (signal.aborted) return;
      if (issued && "error" in issued) return handlers.onStatus("closed", issued.error);
      if (issued) {
        const outcome = await Effect.runPromise(
          connection(issued.ok.url, issued.ok.ticket, () => {
            failures = 0;
            handlers.onStatus("live");
          }),
          { signal },
        ).catch(() => null);
        if (signal.aborted) return;
        // A refusal won't change by asking again.
        if (outcome && Result.isFailure(outcome)) {
          const tag = (outcome.failure as { _tag?: string })._tag;
          if (tag === "Forbidden" || tag === "NotFound") return handlers.onStatus("closed");
        }
      }
      failures++;
      handlers.onStatus("reconnecting");
      await wait(Math.min(1000 * 2 ** Math.min(failures - 1, 5), maxBackoffMs) * (0.75 + Math.random() * 0.5));
    }
  })();

  return () => controller.abort();
}

// The teacher's stream for a session: a snapshot, then changes. Returns a function that stops following.
export const followTeacher = (
  sessionId: string,
  handlers: { onEvent: (event: LiveTeacherEvent) => void; onStatus: (status: LiveStatus, message?: string) => void },
) => follow({ _tag: "teacher", sessionId }, (client) => client["live.teacher"]({ sessionId }), handlers);

// A student's stream for their own attempt.
export const followStudent = (
  attemptId: string,
  handlers: { onEvent: (event: LiveStudentEvent) => void; onStatus: (status: LiveStatus, message?: string) => void },
) => follow({ _tag: "student", attemptId }, (client) => client["live.student"]({ attemptId }), handlers);

// A game: the presenter screen (the teacher) or a player (a student). Each event is that screen's whole view.
export const followGame = (
  sessionId: string,
  handlers: { onEvent: (event: GameView) => void; onStatus: (status: LiveStatus, message?: string) => void },
) => follow({ _tag: "game", sessionId }, (client) => client["live.game"]({ sessionId }), handlers);
