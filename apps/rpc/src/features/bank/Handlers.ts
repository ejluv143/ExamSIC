import { BankRpcs } from "@examinus/contract/bank";
import { Effect } from "effect";
import { requireActor } from "../auth/Session.ts";
import { BankService } from "./Service.ts";

export const BankHandlers = BankRpcs.toLayer(
  Effect.gen(function* () {
    const bank = yield* BankService;

    return BankRpcs.of({
      "bank.list": Effect.fn("bank.list")(function* () {
        const me = yield* requireActor({ questionBank: ["read"] });
        return yield* bank.list(me.actor);
      }),

      "bank.add": Effect.fn("bank.add")(function* (payload) {
        const me = yield* requireActor({ questionBank: ["create"] });
        const questionIds = yield* bank.add(me.actor, payload);
        return { count: questionIds.length, questionIds };
      }),

      "bank.update": Effect.fn("bank.update")(function* ({ question, subject, subjectArea }) {
        const me = yield* requireActor({ questionBank: ["update"] });
        return yield* bank.update(me.actor, question, subject, subjectArea);
      }),

      "bank.delete": Effect.fn("bank.delete")(function* ({ questionIds }) {
        const me = yield* requireActor({ questionBank: ["delete"] });
        return { count: yield* bank.remove(me.actor, questionIds) };
      }),

      "bank.retag": Effect.fn("bank.retag")(function* (payload) {
        const me = yield* requireActor({ questionBank: ["update"] });
        return { count: yield* bank.retag(me.actor, payload) };
      }),

      "bank.renameTag": Effect.fn("bank.renameTag")(function* ({ kind, from, to }) {
        const me = yield* requireActor({ questionBank: ["update"] });
        return { count: yield* bank.renameTag(me.actor, kind, from, to) };
      }),

      "bank.share": Effect.fn("bank.share")(function* (payload) {
        const me = yield* requireActor({ questionBank: ["share"] });
        return { count: yield* bank.share(me.actor, payload) };
      }),

      "bank.shares": Effect.fn("bank.shares")(function* () {
        const me = yield* requireActor({ questionBank: ["read"] });
        return yield* bank.shares(me.actor);
      }),

      "bank.unshare": Effect.fn("bank.unshare")(function* ({ shareId }) {
        const me = yield* requireActor({ questionBank: ["share"] });
        yield* bank.unshare(me.actor, shareId);
      }),

      "bank.copy": Effect.fn("bank.copy")(function* ({ questionIds }) {
        const me = yield* requireActor({ questionBank: ["create"] });
        const copies = yield* bank.copy(me.actor, questionIds);
        return { count: copies.length, questionIds: copies };
      }),
    });
  }),
);
