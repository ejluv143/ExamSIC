// Images: how a question refers to an uploaded file (`asset:<id>` in markdown) and what may be uploaded.
import { Schema } from "effect";
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


// The images a question refers to: in its prompt, choices, matching items and drawing background.
export function questionImages(q: Question | StudentQuestion): { id: string; alt: string; where: string }[] {
  const found = markdownImages(q.prompt).map((m) => ({ ...m, where: "the prompt" }));
  const add = (id: string | undefined, alt: string | undefined, where: string) => {
    if (id !== undefined && id !== "") found.push({ id, alt: alt ?? "", where });
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
    case "categorization":
    case "ordering":
      q.items.forEach((c, i) => add(c.imageId, c.alt, `item ${i + 1}`));
      break;
    case "hotspot":
      add(q.imageId, q.alt, "the hotspot image");
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

