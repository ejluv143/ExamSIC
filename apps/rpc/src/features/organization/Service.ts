// Organizations as the session sees them: creating, switching, deleting and joining with a code. The membership
// rules are Membership's; this adds the session (which organization is active) and the guessing limit on codes.
import { NotFound } from "@examinus/contract/errors";
import { Context, Effect, Layer } from "effect";
import type { Headers as EffectHeaders } from "effect/http";
import { limits, RateLimiter } from "../../platform/RateLimiter.ts";
import { SessionIdentity } from "../auth/Identity.ts";
import { Membership, type Caller } from "./Membership.ts";
import { OrganizationRepo } from "./Repo.ts";

const make = Effect.gen(function* () {
  const repo = yield* OrganizationRepo;
  const membership = yield* Membership;
  const identity = yield* SessionIdentity;
  const limiter = yield* RateLimiter;

  return {
    create: Effect.fn("OrganizationService.create")(function* (userId: string, name: string, headers: EffectHeaders.Headers) {
      return yield* identity.activate(yield* membership.create(userId, name), headers);
    }),

    setActive: Effect.fn("OrganizationService.setActive")(function* (userId: string, organizationId: string | null, headers: EffectHeaders.Headers) {
      if (organizationId !== null && !(yield* repo.memberOf(organizationId, userId)))
        return yield* new NotFound({ message: "You're not a member of that organization." });
      return yield* identity.activate(organizationId, headers);
    }),

    // Deleting removes everything in it; the deleter's session is left with no active organization.
    remove: Effect.fn("OrganizationService.remove")(function* (caller: Caller, headers: EffectHeaders.Headers) {
      yield* membership.remove(caller);
      return yield* identity.current(headers);
    }),

    // Only wrong codes count, to slow guessing.
    joinWithCode: Effect.fn("OrganizationService.joinWithCode")(function* (userId: string, code: string, headers: EffectHeaders.Headers) {
      yield* limiter.check(limits.joinCode, userId);
      const organizationId = yield* membership.redeemInvite(userId, code).pipe(
        Effect.tapError(() => limiter.count(limits.joinCode, userId)),
      );
      return yield* identity.activate(organizationId, headers);
    }),
  };
});

export class OrganizationService extends Context.Service<OrganizationService, Effect.Success<typeof make>>()(
  "examinus/api/OrganizationService",
) {
  static readonly layer = Layer.effect(OrganizationService, make);
}
