"use client";
// The browser's side of the live WebSocket: follows one stream, asking for a fresh ticket on every (re)connect
// and backing off between attempts. Tickets are single use, so a dropped connection can never reuse one.
import { type GameView } from "@examinus/contract/game";
import {
  LiveRpcs,
  liveTicketHeader,
  type LiveStudentEvent,
  type LiveTeacherEvent,
  type TicketTarget,
} from "@examinus/contract/live";
import { Effect, Layer, Result, Stream } from "effect";
import { RpcClient, RpcSerialization, type RpcClientError } from "effect/rpc";
import { Socket } from "effect/socket";

export type LiveStatus = "connecting" | "live" | "reconnecting" | "closed";

const maxBackoffMs = 15_000;
// A ping every 5 seconds, and the connection counts as lost after 20 seconds without any frame. Effect's default
// timeout equals the interval, so a tab whose timers ran a little late (busy with an animation, or in the
// background) dropped healthy connections.
const pingInterval = "5 seconds";
const pingTimeout = "20 seconds";
// After a drop, "reconnecting" shows only if the connection isn't back within this time.
const graceMs = 2_500;

type Issued = { ok: { ticket: string; url: string } } | { error: string };

// A ticket, a refusal ({ error }), or null when it's worth asking again (offline, the server failed).
async function requestTicket(target: TicketTarget, signal: AbortSignal): Promise<Issued | null> {
  try {
    const response = await fetch("/api/live/ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
      cache: "no-store",
      // A redirect means the role can't follow this stream (see getLiveTicket).
      redirect: "manual",
      signal,
    });
    if (response.type === "opaqueredirect") return { error: "You can't follow this session." };
    if (!response.ok && response.status !== 401) return null;
    return (await response.json()) as Issued;
  } catch {
    return null;
  }
}

function follow<E>(
  target: TicketTarget,
  open: (client: RpcClient.FromGroup<typeof LiveRpcs, RpcClientError.RpcClientError>) => Stream.Stream<E, unknown>,
  handlers: { onEvent: (event: E) => void; onStatus: (status: LiveStatus, message?: string) => void },
): () => void {
  const controller = new AbortController();
  const { signal } = controller;

  // The backoff ends early when the network comes back or the tab is shown again.
  let wake: (() => void) | null = null;
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        wake = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      wake = done;
      signal.addEventListener("abort", done, { once: true });
    });
  const nudge = () => wake?.();
  const onVisibility = () => document.visibilityState === "visible" && nudge();
  window.addEventListener("online", nudge);
  document.addEventListener("visibilitychange", onVisibility);

  // What the screen was told last. A drop from "live" is reported after `graceMs`, unless it is live again by then.
  let shown: LiveStatus | null = null;
  let grace: number | undefined;
  const report = (status: LiveStatus, message?: string) => {
    if (status === "reconnecting" && shown === "live") {
      grace ??= window.setTimeout(() => {
        grace = undefined;
        shown = "reconnecting";
        handlers.onStatus("reconnecting");
      }, graceMs);
      return;
    }
    clearTimeout(grace);
    grace = undefined;
    if (status === shown && message === undefined) return;
    shown = status;
    handlers.onStatus(status, message);
  };

  const connection = (url: string, ticket: string, onFirst: () => void) => {
    const sockets = Socket.layerWebSocket(url).pipe(Layer.provide(Socket.layerWebSocketConstructorGlobal));
    const protocol = RpcClient.layerProtocolSocket({ retryTransientErrors: false, pingInterval, pingTimeout }).pipe(
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
      report(failures === 0 && shown === null ? "connecting" : "reconnecting");
      const issued = await requestTicket(target, signal);
      if (signal.aborted) return;
      if (issued && "error" in issued) return report("closed", issued.error);
      if (issued) {
        const outcome = await Effect.runPromise(
          connection(issued.ok.url, issued.ok.ticket, () => {
            failures = 0;
            report("live");
          }),
          { signal },
        ).catch(() => null);
        if (signal.aborted) return;
        // A refusal won't change by asking again.
        if (outcome && Result.isFailure(outcome)) {
          const { failure } = outcome;
          const tag = typeof failure === "object" && failure !== null && "_tag" in failure ? failure._tag : null;
          if (tag === "Forbidden" || tag === "NotFound") return report("closed");
        }
      }
      failures++;
      report("reconnecting");
      await wait(Math.min(1000 * 2 ** Math.min(failures - 1, 5), maxBackoffMs) * (0.75 + Math.random() * 0.5));
    }
  })();

  return () => {
    controller.abort();
    clearTimeout(grace);
    window.removeEventListener("online", nudge);
    document.removeEventListener("visibilitychange", onVisibility);
  };
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
