// The client side of the live WebSocket: follows one stream, asking for a fresh ticket on every (re)connect
// and backing off between attempts (an Effect service, see `LiveClient`). Tickets are single use, so a dropped
// connection can never reuse one. Platform specifics (how a ticket is fetched, the WebSocket constructor, what
// counts as "worth retrying now") are injected through `LiveDeps`.
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

export type Issued = { ok: { ticket: string; url: string } } | { error: string };

export type LiveDeps = {
  // A ticket, a refusal ({ error }), or null when it's worth asking again (offline, the server failed).
  // `signal` aborts when the follower stops.
  requestTicket: (target: TicketTarget, signal?: AbortSignal) => Promise<Issued | null>;
  // The WebSocket class to dial with; the global one by default.
  WebSocket?: new (url: string, protocols?: string | string[]) => Socket.WebSocketLike;
  // Calls `signal` when a backoff should end early (the network came back, the app is visible again).
  // Returns a function that stops listening. Without it, a backoff always runs its course.
  wake?: (signal: () => void) => () => void;
};

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

export type Open<E> = (
  client: RpcClient.FromGroup<typeof LiveRpcs, RpcClientError.RpcClientError>,
) => Stream.Stream<E, unknown>;

export type Handlers<E> = {
  onEvent: (event: E) => void;
  onStatus: (status: LiveStatus, message?: string) => void;
};

// The wait before attempt number `failures` (1-based): 1 s, 2 s, 4 s ... up to 15 s, times a 0.75-1.25 jitter.
export const backoffMs = (failures: number, random: number = Math.random()): number =>
  Math.min(1000 * 2 ** Math.min(failures - 1, 5), maxBackoffMs) * (0.75 + random * 0.5);

// Resolves when `deps.wake` signals, which ends a backoff early.
const wakeEffect = (deps: LiveDeps) =>
  Effect.callback<void>((resume) => {
    const stop = deps.wake?.(() => resume(Effect.void));
    return Effect.sync(() => stop?.());
  });

// The reconnect policy: backoffMs, starting over after an attempt that got as far as a first event. The wait itself
// ends early on `wake`, so the step sleeps by racing the two and tells the schedule not to add a delay of its own.
const backoff = (wake: Effect.Effect<void>) =>
  Schedule.fromStep(
    Effect.sync(() => {
      let failures = 0;
      return (_now: number, input: Dropped | Refused) => {
        if (input._tag === "Dropped" && input.live) failures = 0;
        failures++;
        const ms = backoffMs(failures);
        return Effect.raceFirst(Effect.sleep(Duration.millis(ms)), wake).pipe(
          Effect.as([failures, Duration.zero] as [number, Duration.Duration]),
        );
      };
    }),
  );

// One connection: a fresh socket and RPC client for this ticket, running `open` until it fails or ends.
// Every event goes to `onEvent`; `onFirst` runs before the first one.
const connect = <E>(
  deps: LiveDeps,
  open: Open<E>,
  { url, ticket }: { url: string; ticket: string },
  onFirst: Effect.Effect<void>,
  onEvent: (event: E) => void,
) => {
  const constructor = deps.WebSocket
    ? Layer.succeed(Socket.WebSocketConstructor)((socketUrl, options) => {
        if (options !== undefined && typeof options !== "string" && !Array.isArray(options)) {
          throw new TypeError("WebSocket client options are not supported by this WebSocket constructor");
        }
        return new deps.WebSocket!(socketUrl, options);
      })
    : Socket.layerWebSocketConstructorGlobal;
  const sockets = Socket.layerWebSocket(url).pipe(Layer.provide(constructor));
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
>()("examinus/client/LiveClient") {
  static layer(deps: LiveDeps) {
    const policy = backoff(wakeEffect(deps));
    return Layer.succeed(LiveClient, {
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
                deps.requestTicket(target, signal),
              );
              if (issued && "error" in issued)
                return yield* new Refused({ message: issued.error });
              // Offline or the server failed: worth asking again.
              if (!issued) return yield* new Dropped({ live: false });
              let live = false;
              yield* connect(
                deps,
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
                schedule: policy,
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
}

export type LiveFollowers = {
  // The teacher's stream for a session: a snapshot, then changes. Returns a function that stops following.
  followTeacher: (sessionId: string, handlers: Handlers<LiveTeacherEvent>) => () => void;
  // A student's stream for their own attempt.
  followStudent: (attemptId: string, handlers: Handlers<LiveStudentEvent>) => () => void;
  // A student waiting in a session's lobby: the whole session now, and again on every change.
  followLobby: (sessionId: string, handlers: Handlers<Session>) => () => void;
  // A game: the presenter screen (the teacher) or a player (a student). Each event is that screen's whole view.
  followGame: (sessionId: string, handlers: Handlers<GameView>) => () => void;
};

export function makeLiveClient(deps: LiveDeps): LiveFollowers {
  // The single runtime; built on first use and kept for the life of the returned client.
  const runtime = ManagedRuntime.make(LiveClient.layer(deps));

  // Runs a followed stream into the handlers. Returns a function that stops following.
  function run<E>(target: TicketTarget, open: Open<E>, handlers: Handlers<E>): () => void {
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

  return {
    followTeacher: (sessionId, handlers) =>
      run({ _tag: "teacher", sessionId }, (client) => client["live.teacher"]({ sessionId }), handlers),
    followStudent: (attemptId, handlers) =>
      run({ _tag: "student", attemptId }, (client) => client["live.student"]({ attemptId }), handlers),
    followLobby: (sessionId, handlers) =>
      run({ _tag: "lobby", sessionId }, (client) => client["live.lobby"]({ sessionId }), handlers),
    followGame: (sessionId, handlers) =>
      run({ _tag: "game", sessionId }, (client) => client["live.game"]({ sessionId }), handlers),
  };
}
