"use client";
// The browser's side of the live WebSocket: follows one stream, asking for a fresh ticket on every (re)connect
// and backing off between attempts (an Effect service, see `LiveClient`). Tickets are single use, so a dropped connection can never reuse one.
import type { Session } from "@examinus/domain/quiz";
import { type GameView } from "@examinus/contract/game";
import {
  LiveRpcs,
  liveTicketHeader,
  type LiveStudentEvent,
  type LiveTeacherEvent,
  type TicketTarget,
} from "@examinus/contract/live";
import {
  Context,
  Data,
  Duration,
  Effect,
  Fiber,
  Layer,
  ManagedRuntime,
  Predicate,
  Queue,
  Schedule,
  Stream,
} from "effect";
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
async function requestTicket(
  target: TicketTarget,
  signal: AbortSignal,
): Promise<Issued | null> {
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
    if (response.type === "opaqueredirect")
      return { error: "You can't follow this session." };
    if (!response.ok && response.status !== 401) return null;
    return (await response.json()) as Issued;
  } catch {
    return null;
  }
}
// Why one attempt ended. `live` says whether it got as far as a first event, which resets the backoff.
class Dropped extends Data.TaggedError("Dropped")<{ readonly live: boolean }> {}
// The server won't serve this stream to this user (or the ticket says so); asking again won't change that.
class Refused extends Data.TaggedError("Refused")<{
  readonly message?: string;
}> {}

// What a stream yields: its events, and the status the screen should show (with a reason when closed).
export type LiveUpdate<E> =
  | { readonly _tag: "Event"; readonly event: E }
  | {
      readonly _tag: "Status";
      readonly status: LiveStatus;
      readonly message?: string;
    };

type Open<E> = (
  client: RpcClient.FromGroup<typeof LiveRpcs, RpcClientError.RpcClientError>,
) => Stream.Stream<E, unknown>;

// Resolves when the network comes back or the tab is shown again, which ends a backoff early.
const wake = Effect.callback<void>((resume) => {
  const nudge = () => resume(Effect.void);
  const onVisibility = () => document.visibilityState === "visible" && nudge();
  window.addEventListener("online", nudge);
  document.addEventListener("visibilitychange", onVisibility);
  return Effect.sync(() => {
    window.removeEventListener("online", nudge);
    document.removeEventListener("visibilitychange", onVisibility);
  });
});

// The reconnect policy: 1 s, 2 s, 4 s ... up to 15 s, each with 0.75-1.25 jitter, starting over after an attempt that
// got as far as a first event. The wait itself ends early on `wake`, so the step sleeps by racing the two and
// tells the schedule not to add a delay of its own.
const backoff = Schedule.fromStep(
  Effect.sync(() => {
    let failures = 0;
    return (_now: number, input: Dropped | Refused) => {
      if (input._tag === "Dropped" && input.live) failures = 0;
      failures++;
      const ms =
        Math.min(1000 * 2 ** Math.min(failures - 1, 5), maxBackoffMs) *
        (0.75 + Math.random() * 0.5);
      return Effect.raceFirst(Effect.sleep(Duration.millis(ms)), wake).pipe(
        Effect.as([failures, Duration.zero] as [number, Duration.Duration]),
      );
    };
  }),
);

// One connection: a fresh socket and RPC client for this ticket, running `open` until it fails or ends.
// Every event goes to `onEvent`; `onFirst` runs before the first one.
const connect = <E>(
  open: Open<E>,
  { url, ticket }: { url: string; ticket: string },
  onFirst: Effect.Effect<void>,
  onEvent: (event: E) => void,
) => {
  const sockets = Socket.layerWebSocket(url).pipe(
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
  );
  const protocol = RpcClient.layerProtocolSocket({
    retryTransientErrors: false,
    pingInterval,
    pingTimeout,
  }).pipe(Layer.provide([sockets, RpcSerialization.layerJson]));
  return Effect.scoped(
    Effect.gen(function* () {
      const client = yield* RpcClient.make(LiveRpcs);
      let first = true;
      yield* open(client).pipe(
        Stream.runForEach((event) =>
          Effect.gen(function* () {
            if (first) {
              first = false;
              yield* onFirst;
            }
            onEvent(event);
          }),
        ),
        RpcClient.withHeaders({ [liveTicketHeader]: ticket }),
      );
    }),
  ).pipe(Effect.provide(protocol));
};

export class LiveClient extends Context.Service<
  LiveClient,
  {
    // Follows one stream until its scope ends or it is refused, reconnecting as needed (see `backoff`).
    readonly follow: <E>(
      target: TicketTarget,
      open: Open<E>,
    ) => Stream.Stream<LiveUpdate<E>>;
  }
>()("examinus/web/LiveClient") {
  static readonly layer = Layer.succeed(LiveClient, {
    follow: <E>(target: TicketTarget, open: Open<E>) =>
      Stream.callback<LiveUpdate<E>>((queue) =>
        Effect.gen(function* () {
          // What the screen was told last. A drop from "live" is reported only after `graceMs`, unless it is live
          // again by then.
          const scope = yield* Effect.scope;
          let shown: LiveStatus | null = null;
          let grace: Fiber.Fiber<void> | undefined;
          const show = (status: LiveStatus, message?: string) => {
            shown = status;
            Queue.offerUnsafe(queue, {
              _tag: "Status",
              status,
              ...(message === undefined ? {} : { message }),
            });
          };
          const cancelGrace = Effect.suspend(() => {
            const pending = grace;
            grace = undefined;
            return pending ? Fiber.interrupt(pending) : Effect.void;
          });
          const report = Effect.fnUntraced(function* (
            status: LiveStatus,
            message?: string,
          ) {
            if (status === "reconnecting" && shown === "live") {
              grace ??= yield* Effect.sleep(Duration.millis(graceMs)).pipe(
                Effect.andThen(
                  Effect.sync(() => {
                    grace = undefined;
                    show("reconnecting");
                  }),
                ),
                Effect.forkIn(scope),
              );
              return;
            }
            yield* cancelGrace;
            if (status === shown && message === undefined) return;
            show(status, message);
          });

          const attempt = Effect.gen(function* () {
            const issued = yield* Effect.promise((signal) =>
              requestTicket(target, signal),
            );
            if (issued && "error" in issued)
              return yield* new Refused({ message: issued.error });
            // Offline or the server failed: worth asking again.
            if (!issued) return yield* new Dropped({ live: false });
            let live = false;
            yield* connect(
              open,
              issued.ok,
              Effect.suspend(() => {
                live = true;
                return report("live");
              }),
              (event) => Queue.offerUnsafe(queue, { _tag: "Event", event }),
            ).pipe(
              Effect.catch((failure: unknown) => {
                const tag =
                  Predicate.isTagged(failure, "Forbidden") ||
                  Predicate.isTagged(failure, "NotFound");
                return tag ? Effect.fail(new Refused({})) : Effect.void;
              }),
            );
            // Ending, even cleanly, is a drop: the server closing the socket is no reason to stop following.
            return yield* new Dropped({ live });
          });

          yield* report("connecting");
          yield* attempt.pipe(
            Effect.tapError((error) =>
              error._tag === "Dropped" ? report("reconnecting") : Effect.void,
            ),
            Effect.retry({
              schedule: backoff,
              while: (error) => error._tag === "Dropped",
            }),
            // Only a refusal gets here (the retry never gives up on a drop).
            Effect.catch((error) =>
              report(
                "closed",
                error._tag === "Refused" ? error.message : undefined,
              ),
            ),
          );
          // A refusal ends the stream; a plain unsubscribe interrupts it before this point.
          yield* Queue.end(queue);
        }),
      ),
  });
}

// The single browser-side runtime; built on first use and kept for the life of the page.
const runtime = ManagedRuntime.make(LiveClient.layer);

type Handlers<E> = {
  onEvent: (event: E) => void;
  onStatus: (status: LiveStatus, message?: string) => void;
};

// Runs a followed stream into the handlers. Returns a function that stops following.
function run<E>(
  target: TicketTarget,
  open: Open<E>,
  handlers: Handlers<E>,
): () => void {
  const fiber = runtime.runFork(
    Effect.gen(function* () {
      const live = yield* LiveClient;
      yield* live
        .follow(target, open)
        .pipe(
          Stream.runForEach((update) =>
            Effect.sync(() =>
              update._tag === "Event"
                ? handlers.onEvent(update.event)
                : handlers.onStatus(update.status, update.message),
            ),
          ),
        );
    }),
  );
  return () => fiber.interruptUnsafe();
}

// The teacher's stream for a session: a snapshot, then changes. Returns a function that stops following.
export const followTeacher = (
  sessionId: string,
  handlers: Handlers<LiveTeacherEvent>,
) =>
  run(
    { _tag: "teacher", sessionId },
    (client) => client["live.teacher"]({ sessionId }),
    handlers,
  );

// A student's stream for their own attempt.
export const followStudent = (
  attemptId: string,
  handlers: Handlers<LiveStudentEvent>,
) =>
  run(
    { _tag: "student", attemptId },
    (client) => client["live.student"]({ attemptId }),
    handlers,
  );

// A student waiting in a session's lobby: the whole session now, and again on every change.
export const followLobby = (sessionId: string, handlers: Handlers<Session>) =>
  run({ _tag: "lobby", sessionId }, (client) => client["live.lobby"]({ sessionId }), handlers);

// A game: the presenter screen (the teacher) or a player (a student). Each event is that screen's whole view.
export const followGame = (sessionId: string, handlers: Handlers<GameView>) =>
  run(
    { _tag: "game", sessionId },
    (client) => client["live.game"]({ sessionId }),
    handlers,
  );
