// A line of markdown as nested `Text`, so a blank (an input) can sit inside the sentence. The full renderer builds a
// new tree on each parse and would remount an input being typed in; this one is plain React with stable keys. It
// reads what a prompt needs inside a sentence: **bold**, *italic*, `code`, $math$ and line breaks.
import type { ReactNode } from "react";
import { Text } from "react-native";
import { texToText } from "./math";

const token = /\*\*(.+?)\*\*|\*(.+?)\*|__(.+?)__|`([^`]+)`|\$([^$]+)\$/g;

export function inlineMarkdown(source: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of source.matchAll(token)) {
    if (m.index > last) nodes.push(source.slice(last, m.index));
    const key = `${keyPrefix}-${n++}`;
    if (m[1] !== undefined || m[3] !== undefined)
      nodes.push(
        <Text key={key} className="font-bold">
          {m[1] ?? m[3]}
        </Text>,
      );
    else if (m[2] !== undefined)
      nodes.push(
        <Text key={key} className="italic">
          {m[2]}
        </Text>,
      );
    else
      nodes.push(
        <Text key={key} style={{ fontFamily: "monospace" }}>
          {m[4] ?? texToText(m[5] ?? "")}
        </Text>,
      );
    last = m.index + m[0].length;
  }
  if (last < source.length) nodes.push(source.slice(last));
  return nodes;
}
