// Images: how a question refers to an uploaded file (`asset:<id>` in markdown) and what may be uploaded.
import { Schema } from "effect";
import { kindOf } from "./kinds/index.ts";
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


// The images a question refers to: in its prompt, and (by type) in its choices, items and background.
export function questionImages(q: Question | StudentQuestion): { id: string; alt: string; where: string }[] {
  return [...markdownImages(q.prompt).map((m) => ({ ...m, where: "the prompt" })), ...(kindOf(q).images?.(q) ?? [])];
}

// Where an image has no alt text: what the editor must fix before saving. Empty when every image has some.
export const imagesWithoutAlt = (q: Question): string[] =>
  questionImages(q)
    .filter((i) => i.alt.trim() === "")
    .map((i) => i.where);

