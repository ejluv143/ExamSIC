// Typed RPC client for the API (apps/rpc), used on the server only. Every call forwards the browser's cookies,
// so the API sees the same Better Auth session as the browser.
import "server-only";
import { ApiClient, makeRpcClient, type Api } from "@examinus/client/rpc";
import { ApiRpcs, clientIpHeader, internalSecretHeader } from "@examinus/contract/api";
import { type ResponseCookie } from "@examinus/domain/user";
import { Effect, ManagedRuntime, Predicate, Result, Schema } from "effect";
import { HttpClient } from "effect/http";
import { RpcClient, type RpcClientError } from "effect/rpc";

export type { Api };

// Internal URL of the API, e.g. http://127.0.0.1:3001.
const apiUrlMessage = "API_URL must be the API's http(s) URL, e.g. http://127.0.0.1:3001";
const apiUrl = Schema.decodeUnknownSync(
  Schema.String.annotate({ message: apiUrlMessage }).check(
    Schema.makeFilter((value: string) => URL.canParse(value) && /^https?:$/.test(new URL(value).protocol), {
      message: apiUrlMessage,
    }),
  ),
)(process.env.API_URL);

// Tracing: the web exports OpenTelemetry spans (instrumentation.ts), not Effect spans. An Effect client span would
// be an unexported parent of the API's spans, so RPC spans are off (in makeRpcClient) and callApi turns off Effect's
// own `traceparent` header. The fetch instrumentation from @vercel/otel then makes a fetch span under the Next
// request span and sends its `traceparent`, which the API continues.
// The cookies differ per call, so they go in through `RpcClient.withHeaders` in callApi, not the strategy.
const layer = makeRpcClient({ url: apiUrl, auth: { kind: "cookie", headers: () => ({}) } });

// One runtime per server process; reused across dev hot reloads, and rebuilt when the contract's procedures or
// their payloads changed (module copies in different bundles each see the same signature, so they share it).
const globalForApi = globalThis as unknown as {
  apiRuntime?: ManagedRuntime.ManagedRuntime<ApiClient, never>;
  apiSignature?: string;
};
// Names and payload shapes: a changed payload (not just a new procedure) must not keep an old runtime that still
// validates requests against the old schema.
const signature = [...ApiRpcs.requests.entries()]
  .map(([name, rpc]) => `${name}:${JSON.stringify(Schema.toJsonSchemaDocument(rpc.payloadSchema))}`)
  .sort()
  .join(",");
if (globalForApi.apiSignature !== signature) {
  globalForApi.apiRuntime = ManagedRuntime.make(layer);
  globalForApi.apiSignature = signature;
}
const runtime = globalForApi.apiRuntime!;

// TRUSTED_PROXY_HOPS: how many proxies in front of this app append to x-forwarded-for. Default 1: Vercel (which
// replaces the header with the browser's address) or one reverse proxy. 0: none, so the browser's address is unknown.
const trustedProxyHops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);
// API_INTERNAL_SECRET: lets the API believe the browser's address this app sends. Optional when both run on one machine.
const internalSecret = process.env.API_INTERNAL_SECRET ?? "";

// The browser's address: the x-forwarded-for entry the outermost trusted proxy added, counted from the right. Entries
// further left are whatever the browser sent, so the first one is never used.
function browserIp(headers: Headers): string | null {
  if (!Number.isInteger(trustedProxyHops) || trustedProxyHops < 1) return null;
  const entries = (headers.get("x-forwarded-for") ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  return entries.at(-trustedProxyHops) ?? null;
}

// The browser request headers the API needs: the session cookie and user agent, and the browser's address for
// rate limits, exam IP allowlists and Better Auth's session records. The browser's own x-forwarded-for isn't sent.
export function forwardedHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of ["cookie", "user-agent", "sec-ch-ua-mobile", "sec-ch-ua-platform"]) {
    const value = headers.get(name);
    if (value) out[name] = value;
  }
  const ip = browserIp(headers);
  if (ip) out[clientIpHeader] = ip;
  if (internalSecret) out[internalSecretHeader] = internalSecret;
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
  const result = await runtime.runPromise(
    program.pipe(Effect.result, RpcClient.withHeaders(headers), Effect.provideService(HttpClient.TracerPropagationEnabled, false)),
  );
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
