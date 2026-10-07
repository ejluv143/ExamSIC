// Images. Files live in S3 (a private bucket): the browser uploads straight to it with a presigned POST and
// views images through short-lived signed URLs. Questions, choices and answers refer to an image by its asset id.
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Conflict, Forbidden, NotFound, StorageUnavailable } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";
import type { Question, StudentQuestion } from "./question.ts";

// `question`: a teacher's image in a prompt, choice or background. `answer`: a student's drawing or photo.
export const assetPurposes = ["question", "answer"] as const;
export const AssetPurpose = Schema.Literals(assetPurposes);
export type AssetPurpose = typeof AssetPurpose.Type;

export const assetMimes = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const AssetMime = Schema.Literals(assetMimes);
export type AssetMime = typeof AssetMime.Type;

export const maxAssetBytes = 5 * 1024 * 1024;

// The markdown reference to an uploaded image: `![alt](asset:<id>)`.
export const assetUrlPrefix = "asset:";
export const assetMarkdown = (id: string, alt: string) => `![${alt.replace(/[[\]]/g, "")}](${assetUrlPrefix}${id})`;

const imagePattern = /!\[([^\]]*)\]\(asset:([^)\s]+)\)/g;

// The images a markdown text embeds, with their alt text.
export function markdownImages(markdown: string): { id: string; alt: string }[] {
  return [...markdown.matchAll(imagePattern)].map((m) => ({ id: m[2]!, alt: m[1]! }));
}

// Every asset id found in some text or JSON (markdown prompts, question bodies, drawing answers).
export const assetIdsIn = (text: string): string[] =>
  text.match(/asset-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [];

export const AssetId = { assetId: Schema.String };

// The images a question refers to: in its prompt, choices, matching items and drawing background.
export function questionImages(q: Question | StudentQuestion): { id: string; alt: string; where: string }[] {
  const found = markdownImages(q.prompt).map((m) => ({ ...m, where: "the prompt" }));
  const add = (id: string | undefined, alt: string | undefined, where: string) => {
    if (id !== undefined) found.push({ id, alt: alt ?? "", where });
  };
  switch (q.type) {
    case "multiple_choice":
      q.choices.forEach((c, i) => add(c.imageId, c.alt, `choice ${i + 1}`));
      break;
    case "matching":
      q.left.forEach((c, i) => add(c.imageId, c.alt, `left item ${i + 1}`));
      q.right.forEach((c, i) => add(c.imageId, c.alt, `right item ${i + 1}`));
      break;
    case "drawing":
      add(q.backgroundImageId, q.backgroundAlt, "the background");
      break;
    default:
  }
  return found;
}

// Where an image has no alt text: what the editor must fix before saving. Empty when every image has some.
export const imagesWithoutAlt = (q: Question): string[] =>
  questionImages(q)
    .filter((i) => i.alt.trim() === "")
    .map((i) => i.where);

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
