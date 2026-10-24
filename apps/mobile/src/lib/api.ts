// The app's typed API client (`@examinus/client`): every call sends the session token as `Authorization: Bearer` and
// the app's user agent. One runtime for the life of the app.
import { ApiClient, makeRpcClient, type Api } from "@examinus/client/rpc";
import { Effect, ManagedRuntime, Predicate, Result } from "effect";
import { HttpClient } from "effect/http";
import type { RpcClientError } from "effect/rpc";
import { getToken } from "./auth";
import { mobileFetch } from "./client-info";
import { API_URL } from "./env";

export type { Api };

const runtime = ManagedRuntime.make(makeRpcClient({ url: API_URL, auth: { kind: "bearer", token: getToken }, fetch: mobileFetch }));

type Failure = { readonly _tag: string; readonly message?: string };

// A declared error of the API (`Forbidden`, `NotFound`, ...) or the session ending (`Unauthorized`).
export class ApiError extends Error {
  readonly tag: string;
  constructor(failure: Failure) {
    super(failure.message || messages[failure._tag] || "Something went wrong.");
    this.tag = failure._tag;
  }
}

const messages: Record<string, string> = {
  Unauthorized: "Your session ended. Sign in again.",
  Forbidden: "You can't do that.",
  NotFound: "That no longer exists.",
};

// Told when a call comes back `Unauthorized`, so the app can go back to sign-in.
let onUnauthorized: () => void = () => undefined;
export const setOnUnauthorized = (handler: () => void) => {
  onUnauthorized = handler;
};

// Runs one call and returns its outcome: the declared errors come back in the `Result`, a transport failure (offline,
// the server down) throws an `Error` with a message for the person.
export async function callResult<A, E extends Failure>(
  call: (api: Api) => Effect.Effect<A, E | RpcClientError.RpcClientError>,
): Promise<Result.Result<A, E>> {
  const program = Effect.gen(function* () {
    return yield* call(yield* ApiClient);
  });
  // No `traceparent`/`b3` headers: the app exports no traces, and the API's CORS answer (a browser build) doesn't list them.
  const result = await runtime.runPromise(program.pipe(Effect.result, Effect.provideService(HttpClient.TracerPropagationEnabled, false)));
  if (Result.isFailure(result)) {
    if (Predicate.isTagged(result.failure, "RpcClientError")) {
      throw new Error("Can't reach Examinus. Check your connection and try again.", { cause: result.failure });
    }
    if (result.failure._tag === "Unauthorized") onUnauthorized();
  }
  return result as Result.Result<A, E>;
}

// Runs one call and returns its value; any declared error throws an `ApiError`.
export async function callApi<A, E extends Failure>(
  call: (api: Api) => Effect.Effect<A, E | RpcClientError.RpcClientError>,
): Promise<A> {
  const result = await callResult(call);
  if (Result.isSuccess(result)) return result.success;
  throw new ApiError(result.failure);
}
