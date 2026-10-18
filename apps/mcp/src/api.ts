// The typed RPC client for the Examinus API, as one teacher: the one an HTTP request's OAuth access token was issued
// to, or over stdio a stored login, signed in lazily (first tool call) and again once when the API answers
// Unauthorized, like the web app's cookie handling.
import { AsyncLocalStorage } from "node:async_hooks";
import { ApiRpcs, rpcPath } from "@examinus/contract/api";
import { Context, Effect, Layer, ManagedRuntime, Predicate, Result } from "effect";
import { FetchHttpClient } from "effect/http";
import { RpcClient, RpcSerialization, type RpcClientError } from "effect/rpc";

export type Api = RpcClient.FromGroup<typeof ApiRpcs, RpcClientError.RpcClientError>;

const apiUrl = (process.env.EXAMINUS_API_URL ?? "http://127.0.0.1:3001").replace(/\/+$/, "");
// Better Auth only accepts sign-ins from its own origin: the web app's URL.
const webUrl = process.env.EXAMINUS_WEB_URL ?? "http://localhost:3000";

class ApiClient extends Context.Service<ApiClient, Api>()("examinus/mcp/ApiClient") {}

const runtime = ManagedRuntime.make(
  Layer.effect(ApiClient, RpcClient.make(ApiRpcs, { disableTracing: true })).pipe(
    Layer.provide(RpcClient.layerProtocolHttp({ url: `${apiUrl}${rpcPath}` })),
    Layer.provide([FetchHttpClient.layer, RpcSerialization.layerJson]),
  ),
);

// A failure the API declared (NotFound, QuizInUse...), as the message the AI client sees.
export class ApiError extends Error {
  readonly tag: string;
  constructor(tag: string, message: string) {
    super(message);
    this.tag = tag;
  }
}

type Failure = { readonly _tag: string; readonly message?: string };

let cookie: string | null = null;
let signingIn: Promise<string> | null = null;

async function signIn(): Promise<string> {
  const email = process.env.EXAMINUS_EMAIL;
  const password = process.env.EXAMINUS_PASSWORD;
  if (!email || !password) throw new ApiError("Config", "Set EXAMINUS_EMAIL and EXAMINUS_PASSWORD for the MCP server.");
  const response = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: webUrl },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new ApiError("SignInFailed", `Sign in as ${email} failed: ${response.status} ${(await response.text()).slice(0, 200)}`);
  const session = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const organizationId = process.env.EXAMINUS_ORGANIZATION_ID;
  if (organizationId) await send({ cookie: session }, (api) => api["org.setActive"]({ organizationId }));
  return session;
}

// One call with the given credentials (session cookie or access token): the result, or the declared failure.
async function attempt<A, E extends Failure>(credentials: Record<string, string>, call: (api: Api) => Effect.Effect<A, E | RpcClientError.RpcClientError>) {
  const program = Effect.gen(function* () {
    return yield* call(yield* ApiClient);
  });
  const result = await runtime.runPromise(program.pipe(Effect.result, RpcClient.withHeaders(credentials)));
  if (Result.isFailure(result) && Predicate.isTagged(result.failure, "RpcClientError")) {
    throw new ApiError("RpcClientError", `API request to ${apiUrl} failed: ${String(result.failure)}`);
  }
  return result as Result.Result<A, Failure>;
}

async function send<A, E extends Failure>(credentials: Record<string, string>, call: (api: Api) => Effect.Effect<A, E | RpcClientError.RpcClientError>): Promise<A> {
  const result = await attempt(credentials, call);
  if (Result.isSuccess(result)) return result.success;
  if (result.failure._tag === "Unauthorized") throw new ApiError("Unauthorized", "Unauthorized");
  throw new ApiError(result.failure._tag, `${result.failure._tag}: ${result.failure.message ?? "refused"}`);
}

// Over HTTP, the OAuth access token of the request being served (http.ts): the API accepts it as the teacher it was
// issued to. Over stdio there is none and the server signs in with EXAMINUS_EMAIL/EXAMINUS_PASSWORD.
const accessToken = new AsyncLocalStorage<string>();
export const withAccessToken = <A>(token: string, run: () => A): A => accessToken.run(token, run);

// Runs one RPC as the teacher. With an access token, as its user. Otherwise signs in on first use, and on
// Unauthorized signs in again once and retries.
export async function api<A, E extends Failure>(call: (api: Api) => Effect.Effect<A, E | RpcClientError.RpcClientError>): Promise<A> {
  const token = accessToken.getStore();
  if (token) return send({ authorization: `Bearer ${token}` }, call);
  signingIn ??= signIn();
  cookie ??= await signingIn.catch((error: unknown) => {
    signingIn = null;
    throw error;
  });
  try {
    return await send({ cookie }, call);
  } catch (error) {
    if (!(error instanceof ApiError) || error.tag !== "Unauthorized") throw error;
    signingIn = signIn();
    cookie = await signingIn.catch((e: unknown) => {
      signingIn = null;
      cookie = null;
      throw e;
    });
    return send({ cookie }, call);
  }
}
