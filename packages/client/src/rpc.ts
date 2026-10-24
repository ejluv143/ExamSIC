// Typed RPC client for the API (apps/rpc) over HTTP/JSON, for any platform: the web server forwards the browser's
// cookies, the native apps send a bearer token.
import { ApiRpcs, rpcPath } from "@examinus/contract/api";
import { Context, Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { RpcClient, RpcSerialization, type RpcClientError } from "effect/rpc";

export type Api = RpcClient.FromGroup<typeof ApiRpcs, RpcClientError.RpcClientError>;

// How a call proves who it is. `cookie`: fixed headers added to every request (a caller that needs different headers
// per call passes none here and uses `RpcClient.withHeaders`). `bearer`: the token is fetched on every call, so a
// refreshed token is used right away; `null` sends the call without credentials.
export type AuthStrategy =
  | { kind: "cookie"; headers: () => Record<string, string> }
  | { kind: "bearer"; token: () => Promise<string | null> };

export class ApiClient extends Context.Service<ApiClient, Api>()("examinus/client/ApiClient") {}

// The headers an auth strategy adds to one request.
export async function authHeaders(auth: AuthStrategy): Promise<Record<string, string>> {
  if (auth.kind === "cookie") return auth.headers();
  const token = await auth.token();
  return token === null ? {} : { authorization: `Bearer ${token}` };
}

// The layer providing `ApiClient`. `url` is the API's origin (no path). `fetch` replaces the global one.
// Tracing: RPC spans are off (an Effect client span would be an unexported parent of the API's spans); callers that
// export OpenTelemetry spans turn off Effect's own `traceparent` header themselves (see apps/web/src/lib/api/client.ts).
export function makeRpcClient(options: {
  url: string;
  auth: AuthStrategy;
  fetch?: typeof globalThis.fetch;
}): Layer.Layer<ApiClient> {
  const { url, auth, fetch } = options;
  const http = fetch
    ? FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)))
    : FetchHttpClient.layer;
  return Layer.effect(ApiClient, RpcClient.make(ApiRpcs, { disableTracing: true })).pipe(
    Layer.provide(
      RpcClient.layerProtocolHttp({
        url: `${url}${rpcPath}`,
        transformClient: (client) =>
          HttpClient.mapRequestEffect(client, (request) =>
            Effect.promise(() => authHeaders(auth)).pipe(
              Effect.map((headers) => HttpClientRequest.setHeaders(request, headers)),
            ),
          ),
      }),
    ),
    Layer.provide([http, RpcSerialization.layerJson]),
  );
}
