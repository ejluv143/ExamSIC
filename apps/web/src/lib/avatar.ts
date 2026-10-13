// Drawing players' avatars with DiceBear, in the browser. The style definitions are large, so each one loads
// the first time an avatar in it is drawn.
import { Avatar as DiceAvatar, Style } from "@dicebear/core";
import { avatarNone, type Avatar, type AvatarStyle } from "@examinus/domain/avatar";

const definitions: Record<AvatarStyle, () => Promise<{ default: unknown }>> = {
  lorelei: () => import("@dicebear/styles/lorelei.json"),
  notionists: () => import("@dicebear/styles/notionists.json"),
  "open-peeps": () => import("@dicebear/styles/open-peeps.json"),
  avataaars: () => import("@dicebear/styles/avataaars.json"),
  bottts: () => import("@dicebear/styles/bottts.json"),
  "pixel-art": () => import("@dicebear/styles/pixel-art.json"),
  thumbs: () => import("@dicebear/styles/thumbs.json"),
};

export const styleLabels: Record<AvatarStyle, string> = {
  lorelei: "Lorelei",
  notionists: "Notionists",
  "open-peeps": "Open Peeps",
  avataaars: "Avataaars",
  bottts: "Robots",
  "pixel-art": "Pixel art",
  thumbs: "Thumbs",
};

// Backgrounds to choose from, and the seed's pick when none is chosen (the styles' own are transparent).
export const backgroundColors = ["#b6e3f4", "#c0aede", "#d1d4f9", "#ffd5dc", "#ffdfbf", "#c1f0c1", "#fff3b0", "#e5e7eb"];

const styles = new Map<AvatarStyle, Promise<Style>>();

export function loadStyle(name: AvatarStyle): Promise<Style> {
  let style = styles.get(name);
  if (!style) {
    style = definitions[name]().then((m) => new Style(m.default));
    // A failed load (offline) is tried again next time.
    style.catch(() => styles.delete(name));
    styles.set(name, style);
  }
  return style;
}

// DiceBear's options for the player's choices; choices the style doesn't have are left out.
function optionsOf(style: Style, avatar: Avatar): Record<string, unknown> {
  const options: Record<string, unknown> = { seed: avatar.seed, backgroundColor: backgroundColors };
  const components = style.components();
  for (const [part, variant] of Object.entries(avatar.parts)) {
    const component = components.get(part);
    if (!component || component.extendsName()) continue;
    if (variant === avatarNone) options[`${part}Probability`] = 0;
    else if (component.variants().has(variant)) {
      options[`${part}Variant`] = variant;
      options[`${part}Probability`] = 100;
    }
  }
  for (const [group, hex] of Object.entries(avatar.colors))
    if (group === "background" || style.colors().has(group)) options[`${group}Color`] = [hex];
  return options;
}

// Drawn avatars as data URIs, by style and choices. Bounded: the editor draws a lot of previews.
const drawn = new Map<string, string>();

export function drawAvatar(style: Style, avatar: Avatar): string {
  const key = JSON.stringify(avatar);
  const known = drawn.get(key);
  if (known) return known;
  let uri: string;
  try {
    uri = new DiceAvatar(style, optionsOf(style, avatar)).toDataUri();
  } catch {
    // A saved choice this version of the style rejects: the seed alone.
    uri = new DiceAvatar(style, { seed: avatar.seed, backgroundColor: backgroundColors }).toDataUri();
  }
  if (drawn.size >= 600) drawn.delete(drawn.keys().next().value!);
  drawn.set(key, uri);
  return uri;
}

export type AvatarPart = { name: string; label: string; variants: string[]; optional: boolean };
export type AvatarColor = { name: string; label: string; values: string[] };

const labelOf = (name: string) => {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// What the player can choose in a style: parts with more than one look (or that can be hidden), and colours.
export function choicesOf(style: Style): { parts: AvatarPart[]; colors: AvatarColor[] } {
  const parts: AvatarPart[] = [];
  for (const component of style.components().values()) {
    if (component.extendsName()) continue;
    const variants = [...component.variants().keys()];
    const optional = component.probability() < 100;
    if (variants.length > 1 || optional) parts.push({ name: component.name(), label: labelOf(component.name()), variants, optional });
  }
  const colors: AvatarColor[] = [];
  for (const [name, color] of style.colors()) {
    const values = [...new Set(color.values().map((v) => v.toLowerCase()))].filter((v) => /^#[0-9a-f]{6}$/.test(v));
    if (name !== "background" && values.length > 1) colors.push({ name, label: labelOf(name), values });
  }
  colors.push({ name: "background", label: "Background", values: backgroundColors });
  return { parts, colors };
}

export function randomSeed(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}
