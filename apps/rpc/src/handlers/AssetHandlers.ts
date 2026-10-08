import { createHash } from "node:crypto";
import { AssetRpcs, Conflict, Forbidden, maxAssetBytes, NotFound } from "@examora/contract";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { Assets } from "../Assets.ts";
import { Database } from "../Database.ts";
import { assets } from "../database/schemas/index.ts";
import { newId } from "../database/schemas/_helpers.ts";
import { imageInfo } from "../images.ts";
import { requirePermission } from "../Session.ts";
import { Storage } from "../Storage.ts";

export const AssetHandlers = AssetRpcs.toLayer(
  Effect.gen(function* () {
    const db = yield* Database;
    const storage = yield* Storage;
    const assetService = yield* Assets;

    return AssetRpcs.of({
      "asset.createUpload": Effect.fn("asset.createUpload")(function* ({ purpose, mime, size }) {
        const user = yield* requirePermission({ asset: ["create"] });
        // Teachers upload question images and students their answers, nothing else.
        if (purpose !== (user.role === "teacher" ? "question" : "answer"))
          return yield* new Forbidden({ message: "Your role can't upload that kind of image." });
        if (size < 1 || size > maxAssetBytes) return yield* new Conflict({ message: "Images can be up to 5 MB." });
        const id = newId("asset");
        const key = `${purpose}/${user.id}/${id}`;
        const target = yield* storage.presignUpload(key, mime);
        yield* db.query((d) => d.insert(assets).values({ id, ownerId: user.id, purpose, s3Key: key, mime }));
        return { assetId: id, ...target };
      }),

      "asset.confirm": Effect.fn("asset.confirm")(function* ({ assetId }) {
        const user = yield* requirePermission({ asset: ["create"] });
        const [row] = yield* db.query((d) =>
          d.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.ownerId, user.id))),
        );
        if (!row) return yield* new NotFound({ message: "That upload doesn't exist." });
        if (row.status === "ready" && row.sizeBytes !== null && row.width !== null && row.height !== null)
          return { assetId, sizeBytes: row.sizeBytes, width: row.width, height: row.height };
        const bytes = yield* storage.read(row.s3Key);
        if (!bytes) return yield* new Conflict({ message: "The file wasn't uploaded." });
        const info = imageInfo(bytes);
        if (!info || info.mime !== row.mime) {
          // Not what it claimed to be: nothing keeps it.
          yield* storage.remove([row.s3Key]);
          yield* db.query((d) => d.delete(assets).where(eq(assets.id, assetId)));
          return yield* new Conflict({ message: "That file isn't a valid PNG, JPEG, WebP or GIF image." });
        }
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        yield* db.query((d) =>
          d
            .update(assets)
            .set({ status: "ready", sizeBytes: bytes.length, width: info.width, height: info.height, sha256 })
            .where(eq(assets.id, assetId)),
        );
        return { assetId, sizeBytes: bytes.length, width: info.width, height: info.height };
      }),

      "asset.urls": Effect.fn("asset.urls")(function* ({ assetIds }) {
        const user = yield* requirePermission({ asset: ["read"] });
        const rows = yield* assetService.visible(user, assetIds);
        return yield* assetService.sign(rows);
      }),
    });
  }),
);
