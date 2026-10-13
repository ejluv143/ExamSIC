import type { CSSProperties, ReactNode } from "react";
import { Markdown } from "@/components/markdown";

// Small pieces of the printed paper that the question types' print views and the paper layout share.

export const gray = "1px solid #bfbfbf";

export const bold: CSSProperties = { fontWeight: 700 };
export const indent: CSSProperties = { paddingLeft: "0.2in" };

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const byText = (a: string, b: string) => a.localeCompare(b);

export type AssetUrls = Readonly<Record<string, string>>;

export function Blank({ width, style }: { width: string; style?: CSSProperties }) {
  return <span style={{ display: "inline-block", width, borderBottom: "1px solid #000", ...style }} />;
}

export const codeBox: CSSProperties = {
  fontFamily: "ui-monospace, Consolas, monospace",
  fontSize: "9pt",
  whiteSpace: "pre-wrap",
  border: "1px solid #999",
  padding: "3pt 5pt",
  margin: "3pt 0 0",
};

export function Numbered({ n, children, suffix }: { n: number; children: ReactNode; suffix?: string }) {
  return (
    <div style={{ display: "flex", gap: "0.35em" }}>
      <span>{n}.</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {suffix && <span style={{ whiteSpace: "nowrap", fontWeight: 400 }}>({suffix})</span>}
    </div>
  );
}

// The numbered prompt in bold, which opens every question that has more under it.
export function BoldPrompt({ n, prompt, urls, suffix }: { n: number; prompt: string; urls: AssetUrls; suffix?: string }) {
  return (
    <div style={bold}>
      <Numbered n={n} suffix={suffix}>
        <Markdown assetUrls={urls} eager>{prompt}</Markdown>
      </Numbered>
    </div>
  );
}

// A question answered in one short word or number: the answer goes on a line before the number, unless there is an
// answer sheet.
export function ShortQuestion({
  n,
  prompt,
  urls,
  answerSheet,
  suffix,
}: {
  n: number;
  prompt: string;
  urls: AssetUrls;
  answerSheet: boolean;
  suffix?: string;
}) {
  return (
    <div style={{ display: "flex" }}>
      {!answerSheet && <Blank width="1.65in" style={{ height: "1.15em", flexShrink: 0 }} />}
      <div style={{ paddingLeft: answerSheet ? 0 : "0.06in", flex: 1 }}>
        <Numbered n={n} suffix={suffix}>
          <Markdown assetUrls={urls} eager>{prompt}</Markdown>
        </Numbered>
      </div>
    </div>
  );
}

// A choice or matching item: its picture (if it has one) above its text. A picture with no URL prints its alt text.
export function PaperItem({ item, urls }: { item: { text: string; imageId?: string; alt?: string }; urls: AssetUrls }) {
  const url = item.imageId === undefined ? undefined : urls[item.imageId];
  return (
    <span style={{ display: "block", minWidth: 0 }}>
      {item.imageId !== undefined &&
        (url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={item.alt ?? ""} style={{ display: "block", maxHeight: "1.6in", maxWidth: "100%", breakInside: "avoid" }} />
        ) : (
          <span>[image: {item.alt || "no description"}]</span>
        ))}
      {(item.imageId === undefined || item.text.trim()) && (
        <Markdown inline assetUrls={urls} eager>
          {item.text}
        </Markdown>
      )}
    </span>
  );
}
