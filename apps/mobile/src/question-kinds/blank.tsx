// Identification: the prompt with its blanks drawn in the sentence as lines to type on, dropdowns, word-bank slots or
// one box per letter (`{{#…}}`). The sentence is laid out word by word (a wrapping row), so an input can sit in the
// middle of a line; text is shown with **bold**, *italic*, `code` and $math$ only (a blank prompt is one sentence).
import { promptParts, type Blank } from "@examinus/domain/blanks";
import { partResults } from "@examinus/domain/scoring";
import { Fragment, useRef, useState, type ReactNode } from "react";
import { Pressable, Text, TextInput, View, type TextInputKeyPressEvent } from "react-native";
import { texToText } from "@/markdown/math";
import { useColors } from "@/ui/theme";
import { Picker } from "./picker";
import { ResultFrame, ResultKey, YourAnswer } from "./review-parts";
import type { KindInputProps, KindReviewProps } from "./types";

type Run = { text: string; style: "plain" | "bold" | "italic" | "code" };
const runPattern = /\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|`([^`]+)`|\$([^$]+)\$/g;

function runsOf(text: string): Run[] {
  const runs: Run[] = [];
  let last = 0;
  for (const m of text.matchAll(runPattern)) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), style: "plain" });
    if (m[1] !== undefined || m[2] !== undefined) runs.push({ text: m[1] ?? m[2] ?? "", style: "bold" });
    else if (m[3] !== undefined) runs.push({ text: m[3], style: "italic" });
    else runs.push({ text: m[4] ?? texToText(m[5] ?? ""), style: "code" });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), style: "plain" });
  return runs;
}

const runClass: Record<Run["style"], string> = { plain: "", bold: "font-bold", italic: "italic", code: "bg-surface-muted" };

// The prompt as a wrapping row: each word and each blank is one item. `renderBlank` draws the blank with that index.
export function PromptFlow({ prompt, renderBlank }: { prompt: string; renderBlank: (index: number, blank: Blank) => ReactNode }) {
  let blankIndex = 0;
  const items = promptParts(prompt).flatMap((part, p): ReactNode[] => {
    if ("answers" in part) {
      const i = blankIndex++;
      return [<Fragment key={`b${p}`}>{renderBlank(i, part)}</Fragment>];
    }
    return runsOf(part.text).flatMap((run, r) =>
      run.text.split(/(\n)/).flatMap((line, l) => {
        if (line === "\n") return [<View key={`${p}-${r}-${l}`} className="w-full" />];
        return line
          .split(/\s+/)
          .filter(Boolean)
          .map((word, w) => (
            <Text
              key={`${p}-${r}-${l}-${w}`}
              className={`text-base text-foreground ${runClass[run.style]}`}
              style={run.style === "code" ? { fontFamily: "monospace" } : undefined}
            >
              {word}{" "}
            </Text>
          ));
      }),
    );
  });
  return <View className="flex-row flex-wrap items-center gap-y-2">{items}</View>;
}

export function Input({ question: q, value: answer, onChange, disabled = false }: KindInputProps<"blank">) {
  const colors = useColors();
  const value = Array.isArray(answer) || typeof answer === "string" ? answer : undefined;
  const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const given = Array.from({ length: Math.max(1, q.blankCount) }, (_, i) => list[i] ?? "");
  const [selected, setSelected] = useState<number | null>(null);
  const setAt = (i: number, v: string) => onChange(given.map((x, j) => (j === i ? v : x)));

  const bank = q.clozeInput === "bank";
  const counts = new Map<string, number>();
  for (const w of q.bank) counts.set(w, (counts.get(w) ?? 0) + 1);
  const used = (w: string) => given.filter((x) => x === w).length;

  function pick(word: string) {
    const target = selected !== null && !given[selected] ? selected : given.findIndex((x) => !x);
    if (target < 0) return;
    setAt(target, word);
    setSelected(null);
  }

  function renderBlank(i: number): ReactNode {
    if (i >= given.length) return null;
    const lengths = q.boxes[i];
    if (lengths)
      return <LetterBoxes key={`box${i}`} lengths={lengths} value={given[i] ?? ""} onChange={(v) => setAt(i, v)} label={`Blank ${i + 1}`} disabled={disabled} />;
    if (q.clozeInput === "dropdown")
      return (
        <View className="mx-1">
          <Picker
            label={`Blank ${i + 1}`}
            value={given[i] ?? ""}
            onChange={(v) => setAt(i, v)}
            disabled={disabled}
            options={(q.options[i] ?? []).map((o) => ({ value: o, label: o }))}
          />
        </View>
      );
    if (bank)
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={given[i] ? `Blank ${i + 1}: ${given[i]}. Tap to return the word` : `Blank ${i + 1}, empty`}
          disabled={disabled}
          onPress={() => (given[i] ? setAt(i, "") : setSelected(selected === i ? null : i))}
          className={`mx-1 min-h-8 min-w-20 items-center justify-center rounded-md border-b-2 px-2 py-0.5 ${given[i] ? "border-primary bg-primary-soft" : "border-border bg-surface-muted"} ${selected === i ? "border-primary" : ""}`}
        >
          <Text className="text-foreground">{given[i] || " "}</Text>
        </Pressable>
      );
    return (
      <TextInput
        key={`line${i}`}
        value={given[i]}
        onChangeText={(v) => setAt(i, v)}
        editable={!disabled}
        accessibilityLabel={`Blank ${i + 1}`}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors.muted}
        className="mx-1 min-h-9 w-36 border-b-2 border-border px-1 py-0.5 text-center text-foreground"
      />
    );
  }

  return (
    <View className="gap-3">
      <PromptFlow prompt={q.prompt} renderBlank={renderBlank} />
      {bank && (
        <View className="flex-row flex-wrap gap-2" accessibilityLabel="Word bank">
          {[...counts.keys()].map((w) => (
            <Pressable
              key={w}
              accessibilityRole="button"
              disabled={disabled || used(w) >= (counts.get(w) ?? 0)}
              onPress={() => pick(w)}
              className={`rounded-full border border-border bg-surface px-3 py-1.5 ${disabled || used(w) >= (counts.get(w) ?? 0) ? "opacity-40" : ""}`}
            >
              <Text className="text-sm text-foreground">{w}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// One box per letter, words apart. The answer is the letters joined, words separated by a space. Typing moves to the
// next box, Backspace on an empty box goes to the one before and clears it, and several characters arriving in one
// box (a paste) fill from there. The boxes keep their own letters (the saved answer can't say which were skipped); a
// saved answer fills them from the first.
function LetterBoxes({
  lengths,
  value,
  onChange,
  label,
  disabled,
}: {
  lengths: readonly number[];
  value: string;
  onChange: (v: string) => void;
  label: string;
  disabled: boolean;
}) {
  const total = lengths.reduce((sum, n) => sum + n, 0);
  const [letters, setLetters] = useState(() => Array.from({ length: total }, (_, i) => value.replace(/\s+/g, "")[i] ?? ""));
  const current = useRef(letters);
  const refs = useRef<({ focus: () => void } | null)[]>([]);
  const update = (next: string[]) => {
    current.current = next;
    setLetters(next);
    const words: string[] = [];
    let at = 0;
    for (const n of lengths) {
      words.push(next.slice(at, at + n).join(""));
      at += n;
    }
    onChange(words.join(" ").replace(/\s+/g, " ").trim());
  };
  const set = (i: number, chars: string) => {
    const next = [...current.current];
    const incoming = chars.replace(/\s+/g, "").split("");
    for (let k = 0; k < incoming.length && i + k < total; k++) next[i + k] = incoming[k]!;
    update(next);
    refs.current[Math.min(total - 1, i + Math.max(1, incoming.length))]?.focus();
  };
  let index = 0;
  return (
    <View accessibilityLabel={`${label}, ${total} letters`} className="mx-1 flex-row flex-wrap items-center gap-x-3 gap-y-1">
      {lengths.map((n, w) => (
        <View key={w} className="flex-row gap-1">
          {Array.from({ length: n }, () => {
            const i = index++;
            return (
              <TextInput
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                value={letters[i]}
                editable={!disabled}
                accessibilityLabel={`${label}, letter ${i + 1}`}
                autoCapitalize="characters"
                autoCorrect={false}
                spellCheck={false}
                selectTextOnFocus
                className="h-10 w-9 rounded-lg border border-border bg-surface p-0 text-center text-lg font-medium uppercase text-foreground"
                onChangeText={(text) => {
                  const was = current.current[i] ?? "";
                  // The box already holds a letter: the new one replaces it.
                  const typed = text.length > 1 && was !== "" ? text.replace(was, "") || text : text;
                  if (typed === "") update(current.current.map((l, j) => (j === i ? "" : l)));
                  else set(i, typed);
                }}
                onKeyPress={(e: TextInputKeyPressEvent) => {
                  if (e.nativeEvent.key === "Backspace" && (current.current[i] ?? "") === "" && i > 0) {
                    update(current.current.map((l, j) => (j === i - 1 ? "" : l)));
                    refs.current[i - 1]?.focus();
                  }
                }}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function Review({ question: q, answer, full, feedback, assetUrls }: KindReviewProps<"blank">) {
  const parts = partResults(q, answer);
  return (
    <View className="gap-3">
      {/* Blanks are filled in the sentence itself. */}
      <PromptFlow
        prompt={q.prompt}
        renderBlank={(b, { answers }) => {
          const part = parts?.[b];
          return (
            <Text className={`mx-0.5 rounded px-1.5 font-medium ${part?.correct ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
              {part?.given || "—"}
              {!part?.correct && <Text className="text-success"> ({answers[0]})</Text>}
            </Text>
          );
        }}
      />
      <ResultFrame q={q} urls={assetUrls} feedback={feedback}>
        {!parts && <YourAnswer q={q} answer={answer} urls={assetUrls} />}
        <ResultKey q={q} full={full} urls={assetUrls} />
      </ResultFrame>
    </View>
  );
}

