import { BankRpcs } from "@examinus/contract/bank";
import { Effect } from "effect";
import { requirePermission } from "../auth/Session.ts";
import { BankService } from "./Service.ts";

export const BankHandlers = BankRpcs.toLayer(
  Effect.gen(function* () {
    const bank = yield* BankService;

    return BankRpcs.of({
      "bank.list": Effect.fn("bank.list")(function* () {
        const user = yield* requirePermission({ questionBank: ["read"] });
        return yield* bank.list(user.id);
      }),

      "bank.add": Effect.fn("bank.add")(function* (payload) {
        const user = yield* requirePermission({ questionBank: ["create"] });
        const questionIds = yield* bank.add(user.id, payload);
        return { count: questionIds.length, questionIds };
      }),

      "bank.update": Effect.fn("bank.update")(function* ({ question, subject, subjectArea }) {
        const user = yield* requirePermission({ questionBank: ["update"] });
        return yield* bank.update(user.id, question, subject, subjectArea);
      }),

      "bank.delete": Effect.fn("bank.delete")(function* ({ questionIds }) {
        const user = yield* requirePermission({ questionBank: ["delete"] });
        return { count: yield* bank.remove(user.id, questionIds) };
      }),

      "bank.retag": Effect.fn("bank.retag")(function* (payload) {
        const user = yield* requirePermission({ questionBank: ["update"] });
        return { count: yield* bank.retag(user.id, payload) };
      }),

      "bank.renameTag": Effect.fn("bank.renameTag")(function* ({ kind, from, to }) {
        const user = yield* requirePermission({ questionBank: ["update"] });
        return { count: yield* bank.renameTag(user.id, kind, from, to) };
      }),

      "bank.share": Effect.fn("bank.share")(function* (payload) {
        const user = yield* requirePermission({ questionBank: ["share"] });
        return { count: yield* bank.share(user.id, payload) };
      }),

      "bank.shares": Effect.fn("bank.shares")(function* () {
        const user = yield* requirePermission({ questionBank: ["read"] });
        return yield* bank.shares(user.id);
      }),

      "bank.unshare": Effect.fn("bank.unshare")(function* ({ shareId }) {
        const user = yield* requirePermission({ questionBank: ["share"] });
        yield* bank.unshare(user.id, shareId);
      }),

      "bank.copy": Effect.fn("bank.copy")(function* ({ questionIds }) {
        const user = yield* requirePermission({ questionBank: ["create"] });
        const copies = yield* bank.copy(user.id, questionIds);
        return { count: copies.length, questionIds: copies };
      }),
    });
  }),
);
