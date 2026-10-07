// Typed RPC client for the API (apps/api), used on the server only. Every call forwards the browser's cookies,
// so the API sees the same Better Auth session as the browser.
import "server-only";
import { ApiRpcs, rpcPath, type ResponseCookie } from "@examora/contract";
import { Context, Effect, Layer, ManagedRuntime, Predicate, Result } from "effect";
import { FetchHttpClient } from "effect/http";
import { RpcClient, RpcSerialization, type RpcClientError } from "effect/rpc";
import { z } from "zod";

// Internal URL of the API, e.g. http://127.0.0.1:3001.
const apiUrl = z
  .url({ protocol: /^https?$/, error: "API_URL must be the API's http(s) URL, e.g. http://127.0.0.1:3001" })
  .parse(process.env.API_URL);

type Api = RpcClient.FromGroup<typeof ApiRpcs, RpcClientError.RpcClientError>;

class ApiClient extends Context.Service<ApiClient, Api>()("examora/web/ApiClient") {
  static readonly layer = Layer.effect(ApiClient, RpcClient.make(ApiRpcs)).pipe(
    Layer.provide(RpcClient.layerProtocolHttp({ url: `${apiUrl}${rpcPath}` })),
    Layer.provide([FetchHttpClient.layer, RpcSerialization.layerJson]),
  );
}

// One runtime per server process; reused across dev hot reloads.
const globalForApi = globalThis as unknown as { apiRuntime?: ManagedRuntime.ManagedRuntime<ApiClient, never> };
const runtime = (globalForApi.apiRuntime ??= ManagedRuntime.make(ApiClient.layer));

// The browser request headers the API needs: the session cookie, and the client's IP and user agent for
// Better Auth's rate limiting and session records.
export function forwardedHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of ["cookie", "user-agent", "x-forwarded-for"]) {
    const value = headers.get(name);
    if (value) out[name] = value;
  }
  return out;
}

// Runs one API call. Expected errors (the RPC's declared errors) come back in the `Result`;
// transport failures and defects throw.
export async function callApi<A, E>(
  call: (api: Api) => Effect.Effect<A, E | RpcClientError.RpcClientError>,
  headers: Record<string, string>,
): Promise<Result.Result<A, E>> {
  const program = Effect.gen(function* () {
    return yield* call(yield* ApiClient);
  });
  const result = await runtime.runPromise(program.pipe(Effect.result, RpcClient.withHeaders(headers)));
  if (Result.isFailure(result) && Predicate.isTagged(result.failure, "RpcClientError")) {
    // Effect errors have read-only `message`, which Next.js rewrites when reporting; wrap instead.
    throw new Error(`API request failed: ${String(result.failure)}`, { cause: result.failure });
  }
  return result as Result.Result<A, E>;
}

// Anything with Next's cookie `set`: `cookies()` in server actions, `NextResponse.cookies` in the proxy.
type CookieTarget = {
  set(name: string, value: string, options: Omit<ResponseCookie, "name" | "value">): unknown;
};

// Sets the cookies the API asked for (Better Auth's session cookies) on the browser.
export function applyCookies(target: CookieTarget, cookies: readonly ResponseCookie[]) {
  for (const { name, value, ...options } of cookies) target.set(name, value, options);
}
