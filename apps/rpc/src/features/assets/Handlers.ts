import { AssetRpcs } from "@examinus/contract";
import { Effect } from "effect";
import { requirePermission } from "../auth/Session.ts";
import { Assets } from "./Service.ts";

export const AssetHandlers = AssetRpcs.toLayer(
  Effect.gen(function* () {
    const assets = yield* Assets;

    return AssetRpcs.of({
      "asset.createUpload": Effect.fn("asset.createUpload")(function* ({ purpose, mime, size }) {
        const user = yield* requirePermission({ asset: ["create"] });
        return yield* assets.createUpload(user, purpose, mime, size);
      }),

      "asset.confirm": Effect.fn("asset.confirm")(function* ({ assetId }) {
        const user = yield* requirePermission({ asset: ["create"] });
        return yield* assets.confirm(user, assetId);
      }),

      "asset.urls": Effect.fn("asset.urls")(function* ({ assetIds }) {
        const user = yield* requirePermission({ asset: ["read"] });
        const rows = yield* assets.visible(user, assetIds);
        return yield* assets.sign(rows);
      }),
    });
  }),
);
