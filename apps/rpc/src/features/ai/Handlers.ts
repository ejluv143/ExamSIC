import { AiRpcs } from "@examinus/contract/ai";
import { Effect } from "effect";
import { requireOrganization } from "../auth/Session.ts";
import { Ai } from "./Service.ts";

export const AiHandlers = AiRpcs.toLayer(
  Effect.gen(function* () {
    const ai = yield* Ai;

    return AiRpcs.of({
      "ai.status": Effect.fn("ai.status")(function* () {
        const me = yield* requireOrganization({ ai: ["use"] });
        return yield* ai.options(me.organization.id);
      }),

      "ai.keys": Effect.fn("ai.keys")(function* () {
        const me = yield* requireOrganization({ ai: ["configure"] });
        return yield* ai.keys(me.organization.id);
      }),

      "ai.setKey": Effect.fn("ai.setKey")(function* ({ provider, apiKey, model }) {
        const me = yield* requireOrganization({ ai: ["configure"] });
        return yield* ai.setKey(me.organization.id, provider, apiKey, model);
      }),

      "ai.removeKey": Effect.fn("ai.removeKey")(function* ({ provider }) {
        const me = yield* requireOrganization({ ai: ["configure"] });
        yield* ai.removeKey(me.organization.id, provider);
      }),

      "ai.generate": Effect.fn("ai.generate")(function* (request) {
        const me = yield* requireOrganization({ ai: ["use"] });
        return { questions: yield* ai.generate({ id: me.id, organizationId: me.organization.id }, request) };
      }),

      "ai.suggestGrade": Effect.fn("ai.suggestGrade")(function* (request) {
        const me = yield* requireOrganization({ ai: ["use"] });
        return yield* ai.suggestGrade({ id: me.id, organizationId: me.organization.id }, request);
      }),
    });
  }),
);
