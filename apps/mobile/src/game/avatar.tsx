// Players' avatars: DiceBear draws the SVG from the player's choices (the same way as the web app's
// `features/auth/avatar.ts`), and react-native-svg shows it. A grey circle stands in while the style loads.
import { Avatar as DiceAvatar, Style } from "@dicebear/core";
import { avatarNone, type Avatar, type AvatarStyle } from "@examinus/domain/avatar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";

const definitions: Record<AvatarStyle, () => Promise<{ default: unknown }>> = {
  lorelei: () => import("@dicebear/styles/lorelei.json"),
  notionists: () => import("@dicebear/styles/notionists.json"),
  "open-peeps": () => import("@dicebear/styles/open-peeps.json"),
  avataaars: () => import("@dicebear/styles/avataaars.json"),
  bottts: () => import("@dicebear/styles/bottts.json"),
  "pixel-art": () => import("@dicebear/styles/pixel-art.json"),
  thumbs: () => import("@dicebear/styles/thumbs.json"),
};

const backgroundColors = ["#b6e3f4", "#c0aede", "#d1d4f9", "#ffd5dc", "#ffdfbf", "#c1f0c1", "#fff3b0", "#e5e7eb"];

const styles = new Map<AvatarStyle, Promise<Style>>();

function loadStyle(name: AvatarStyle): Promise<Style> {
  let style = styles.get(name);
  if (!style) {
    style = definitions[name]().then((m) => new Style(m.default as ConstructorParameters<typeof Style>[0]));
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
  for (const [group, hex] of Object.entries(avatar.colors)) if (group === "background" || style.colors().has(group)) options[`${group}Color`] = [hex];
  return options;
}

const drawn = new Map<string, string>();

function draw(style: Style, avatar: Avatar): string {
  const key = JSON.stringify(avatar);
  const known = drawn.get(key);
  if (known) return known;
  let svg: string;
  try {
    svg = new DiceAvatar(style, optionsOf(style, avatar) as never).toString();
  } catch {
    // A saved choice this version of the style rejects: the seed alone.
    svg = new DiceAvatar(style, { seed: avatar.seed, backgroundColor: backgroundColors } as never).toString();
  }
  if (drawn.size >= 300) drawn.delete(drawn.keys().next().value!);
  drawn.set(key, svg);
  return svg;
}

export function AvatarImage({ avatar, size = 40 }: { avatar: Avatar; size?: number }) {
  const [loaded, setLoaded] = useState<{ name: AvatarStyle; style: Style } | null>(null);
  useEffect(() => {
    let live = true;
    loadStyle(avatar.style).then(
      (style) => live && setLoaded({ name: avatar.style, style }),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [avatar.style]);
  const box = { width: size, height: size, borderRadius: size / 2, overflow: "hidden" as const };
  if (loaded?.name !== avatar.style) return <View style={box} className="bg-surface-muted" />;
  return (
    <View style={box}>
      <SvgXml xml={draw(loaded.style, avatar)} width={size} height={size} />
    </View>
  );
}
