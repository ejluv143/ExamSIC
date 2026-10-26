// Markdown for prompts, choices, instructions, essays and feedback, as the web's `Markdown` shows it: lists, tables
// (as text rows), emphasis, code, links, and uploaded images (`![alt](asset:<id>)`) from the signed `assetUrls`.
// Math (`$…$`, `$$…$$`) is drawn as monospace text (see ./math.ts), because KaTeX needs a DOM Hermes doesn't have.
// A blank (`{{answer}}`) that reaches this renderer is drawn as a line; the identification input places real inputs
// with `BlankPrompt` instead.
import MarkdownDisplay, { type RenderRules } from "react-native-markdown-display";
import { useMemo, type ReactNode } from "react";
import { Image, Linking, Text, View } from "react-native";
import { useColors } from "@/ui/theme";
import { texToText } from "./math";

const mathMark = /\uE002(\d+)\uE003/;

// Swaps each formula for a marker (the markdown parser would otherwise read `_` and `*` inside it as emphasis).
function extractMath(source: string): { text: string; math: string[] } {
  const math: string[] = [];
  const mark = (tex: string) => `\uE002${math.push(tex) - 1}\uE003`;
  const text = source
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) => mark(tex))
    .replace(/\$([^$\n]+?)\$/g, (_, tex: string) => mark(tex))
    .replace(/\{\{#?[^{}]*\}\}/g, "\u2581\u2581\u2581\u2581");
  return { text, math };
}

export function Markdown({
  children,
  assetUrls = {},
  inline = false,
  small = false,
  muted = false,
  color: textColor,
}: {
  children: string;
  // Signed URLs by asset id. An image without one shows its alt text.
  assetUrls?: Readonly<Record<string, string>>;
  // Short text inside a row (a choice, a table cell): no space around the paragraphs.
  inline?: boolean;
  small?: boolean;
  muted?: boolean;
  // A fixed text colour, for text on a coloured tile.
  color?: string;
}) {
  const colors = useColors();
  const { text, math } = useMemo(() => extractMath(children), [children]);
  const size = small ? 14 : 16;
  const color = textColor ?? (muted ? colors.muted : colors.foreground);
  const style = useMemo(
    () => ({
      body: { color, fontSize: size, lineHeight: size * 1.5 },
      paragraph: { marginTop: 0, marginBottom: inline ? 0 : 8, flexWrap: "wrap" as const, flexDirection: "row" as const },
      heading1: { fontSize: size * 1.5, fontWeight: "700" as const, marginVertical: 6 },
      heading2: { fontSize: size * 1.3, fontWeight: "700" as const, marginVertical: 6 },
      heading3: { fontSize: size * 1.15, fontWeight: "600" as const, marginVertical: 4 },
      code_inline: { fontFamily: "monospace", backgroundColor: colors["surface-muted"], color: colors.foreground, borderRadius: 4 },
      code_block: { fontFamily: "monospace", backgroundColor: colors["surface-muted"], color: colors.foreground, borderWidth: 0, borderRadius: 8, padding: 10 },
      fence: { fontFamily: "monospace", backgroundColor: colors["surface-muted"], color: colors.foreground, borderWidth: 0, borderRadius: 8, padding: 10 },
      blockquote: { backgroundColor: colors["surface-muted"], borderLeftColor: colors.border, borderLeftWidth: 4, paddingHorizontal: 8 },
      link: { color: colors.primary },
      hr: { backgroundColor: colors.border },
      table: { borderColor: colors.border, borderWidth: 1, borderRadius: 4 },
      th: { borderColor: colors.border, padding: 4 },
      td: { borderColor: colors.border, padding: 4 },
      tr: { borderColor: colors.border },
      list_item: { marginBottom: 2 },
    }),
    [color, size, inline, colors],
  );
  const rules = useMemo<RenderRules>(
    () => ({
      text: (node, _children, _parent, styles, inherited = {}) => {
        const pieces = node.content.split(/(\uE002\d+\uE003)/);
        return (
          <Text key={node.key} style={[inherited, styles.text]}>
            {pieces.map((piece, i) => {
              const m = mathMark.exec(piece);
              if (!m) return piece;
              return (
                <Text key={i} style={{ fontFamily: "monospace" }}>
                  {texToText(math[Number(m[1])] ?? "")}
                </Text>
              );
            })}
          </Text>
        );
      },
      image: (node) => {
        const src = String(node.attributes.src ?? "");
        const alt = String(node.attributes.alt ?? "");
        const uri = src.startsWith("asset:") ? assetUrls[src.slice("asset:".length)] : /^https?:/.test(src) ? src : undefined;
        if (!uri)
          return (
            <Text key={node.key} className="text-xs text-muted">
              [image: {alt || "no description"}]
            </Text>
          );
        return (
          <Image key={node.key} source={{ uri }} accessibilityLabel={alt} resizeMode="contain" style={{ width: "100%", height: 200, marginVertical: 4 }} />
        );
      },
    }),
    [assetUrls, math],
  );
  return (
    <MarkdownDisplay style={style} rules={rules} onLinkPress={(url) => {
        void Linking.openURL(url);
        return false;
      }}>
      {text}
    </MarkdownDisplay>
  );
}

// A picture by asset id from the signed URLs, or its alt text when there is no link.
export function AssetImage({ id, alt, assetUrls, height = 160 }: { id: string; alt: string; assetUrls: Readonly<Record<string, string>>; height?: number }): ReactNode {
  const uri = assetUrls[id];
  if (!uri)
    return (
      <View className="rounded-md border border-dashed border-border px-2 py-1">
        <Text className="text-xs text-muted">{alt || "Image"}</Text>
      </View>
    );
  return <Image source={{ uri }} accessibilityLabel={alt} resizeMode="contain" style={{ width: "100%", height }} />;
}
