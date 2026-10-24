import { ClientRpcs } from "@examinus/contract/client";
import { Effect } from "effect";
import { requirePermission } from "../auth/Session.ts";
import { Attestation } from "./Attestation.ts";

export const ClientHandlers = ClientRpcs.toLayer(
  Effect.gen(function* () {
    const attestation = yield* Attestation;
    return ClientRpcs.of({
      "client.nonce": Effect.fn("client.nonce")(function* () {
        const user = yield* requirePermission({ attempt: ["read"] });
        return { nonce: yield* attestation.nonce(user.id) };
      }),
      "client.attest": Effect.fn("client.attest")(function* ({ nonce, platform, token, keyId, deviceId }) {
        const user = yield* requirePermission({ attempt: ["read"] });
        return yield* attestation.attest(user.id, { nonce, platform, token, keyId, deviceId });
      }),
    });
  }),
);
