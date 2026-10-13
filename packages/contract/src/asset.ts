// Images. Files live in S3 (a private bucket): the browser uploads straight to it with a presigned POST and
// views images through short-lived signed URLs. Questions, choices and answers refer to an image by its asset id.
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { AssetMime, AssetPurpose } from "@examinus/domain/asset";
import { Conflict, Forbidden, NotFound } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";

export const AssetId = { assetId: Schema.String };

// The presigned POST: send `fields` plus the file (as the last field, named `file`) to `url`.
export const UploadTarget = Schema.Struct({
  assetId: Schema.String,
  url: Schema.String,
  fields: Schema.Record(Schema.String, Schema.String),
});
export type UploadTarget = typeof UploadTarget.Type;

export const AssetInfo = Schema.Struct({
  assetId: Schema.String,
  sizeBytes: Schema.Int,
  width: Schema.Int,
  height: Schema.Int,
});
export type AssetInfo = typeof AssetInfo.Type;

// The API has no S3 settings, so images can't be stored or shown.
export class StorageUnavailable extends Schema.TaggedError<StorageUnavailable>()("StorageUnavailable", {
  message: Schema.String,
}) {}

const errors = Schema.Union([Forbidden, NotFound, Conflict, StorageUnavailable]);

export class AssetRpcs extends RpcGroup.make(
  // Teachers upload `question` images, students `answer` images. S3 itself refuses another type or a file
  // over 5 MB. StorageUnavailable when the API has no S3 settings.
  Rpc.make("createUpload", {
    payload: { purpose: AssetPurpose, mime: AssetMime, size: Schema.Int },
    success: UploadTarget,
    error: Schema.Union([Forbidden, Conflict, StorageUnavailable]),
  }),
  // After the upload: checks the file is there and really is that image, reads its size and dimensions, and
  // marks it ready. Conflict (and the file is deleted) when it isn't a valid image.
  Rpc.make("confirm", { payload: AssetId, success: AssetInfo, error: errors }),
  // Signed GET URLs (valid for ten minutes) by asset id, only for the assets the signed-in user may see:
  // their own uploads; question images of a quiz they own, or of a session that is open to them; students'
  // answer images for the student and the session's teacher. The rest are left out.
  Rpc.make("urls", {
    payload: { assetIds: Schema.Array(Schema.String) },
    success: Schema.Record(Schema.String, Schema.String),
    error: Schema.Union([Forbidden, StorageUnavailable]),
  }),
)
  .prefix("asset.")
  .middleware(AuthMiddleware) {}
