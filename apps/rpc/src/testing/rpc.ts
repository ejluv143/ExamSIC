// Calls the handlers an RPC group's `toLayer` built, without a transport: the test builds the handlers layer, then
// asks for a handler by its tag and calls it with the payload. Middleware is not applied, so what it would provide
// (CurrentUser, LiveClaims) is provided by the test.
import type { Context, Effect, Stream } from "effect";
import { Headers } from "effect/http";
import type { Rpc, RpcGroup } from "effect/rpc";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- whatever services the handlers were built with
export const handlersOf = <R extends Rpc.Any>(group: RpcGroup.RpcGroup<R>, context: Context.Context<any>) => {
  const handler = (tag: string) => {
    const rpc = group.requests.get(tag);
    const entry = rpc && context.mapUnsafe.get(rpc.key);
    if (!entry) throw new Error(`no handler built for ${tag}`);
    return entry.handler as (payload: unknown, options: unknown) => unknown;
  };
  const options = { headers: Headers.empty };
  return {
    // A handler that returns an effect; `Env` is what it needs from the test (e.g. CurrentUser).
    call: <Tag extends R["_tag"], Env = never>(tag: Tag, payload: Rpc.Payload<Rpc.ExtractTag<R, Tag>>) =>
      handler(tag)(payload, options) as Effect.Effect<Rpc.Success<Rpc.ExtractTag<R, Tag>>, Rpc.Error<Rpc.ExtractTag<R, Tag>>, Env>,
    // A handler that returns a stream of `A`.
    stream: <A, Tag extends R["_tag"], Env = never>(tag: Tag, payload: Rpc.Payload<Rpc.ExtractTag<R, Tag>>) =>
      handler(tag)(payload, options) as Stream.Stream<A, Rpc.Error<Rpc.ExtractTag<R, Tag>>, Env>,
  };
};
