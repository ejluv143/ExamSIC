import { AssetRpcs, StorageUnavailable } from "@examinus/contract/asset";
import { Effect } from "effect";
import { requirePermission } from "../auth/Session.ts";
import { Assets } from "./Service.ts";

// The API has no S3 settings: say so in the contract's words.
const unavailable = () => Effect.fail(new StorageUnavailable({ message: "Image storage isn't set up on this server." }));

export const AssetHandlers = AssetRpcs.toLayer(
  Effect.gen(function* () {
    const assets = yield* Assets;

    return AssetRpcs.of({
      "asset.createUpload": Effect.fn("asset.createUpload")(function* ({ purpose, mime, size }) {
        const user = yield* requirePermission({ asset: ["create"] });
        return yield* assets.createUpload(user, purpose, mime, size).pipe(Effect.catchTag("StorageNotConfigured", unavailable));
      }),

      "asset.confirm": Effect.fn("asset.confirm")(function* ({ assetId }) {
        const user = yield* requirePermission({ asset: ["create"] });
        return yield* assets.confirm(user, assetId).pipe(Effect.catchTag("StorageNotConfigured", unavailable));
      }),

      "asset.urls": Effect.fn("asset.urls")(function* ({ assetIds }) {
        const user = yield* requirePermission({ asset: ["read"] });
        const rows = yield* assets.visible(user, assetIds);
        return yield* assets.sign(rows).pipe(Effect.catchTag("StorageNotConfigured", unavailable));
      }),
    });
  }),
);
