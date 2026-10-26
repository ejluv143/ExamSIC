// The pieces the types' reviews are made of (the web's `shared/review-*.tsx`): the frame with feedback and
// explanation, "No answer", the key under a wrong answer, the answer on one line, answers in code or words, and a
// list of parts (blanks, pairs, items) each marked right or wrong.
import { answerKey, answerText } from "@examinus/domain/answer-text";
import type { PartResult } from "@examinus/domain/kinds/base";
import type { Question, RevealQuestion } from "@examinus/domain/question";
import type { AnswerValue } from "@examinus/domain/quiz";
import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { Markdown } from "@/markdown/markdown";

type Urls = Readonly<Record<string, string>>;

// The frame of the result of one question: what the type shows of the answer (`children`), then the teacher's
// feedback and the explanation.
export function ResultFrame({ q, urls, feedback, children }: { q: Question | RevealQuestion; urls: Urls; feedback: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      {children}
      {feedback !== "" && (
        <View className="rounded-md bg-info-soft px-2 py-1">
          <Markdown small assetUrls={urls}>{feedback}</Markdown>
        </View>
      )}
      {q.explanation !== undefined && q.explanation !== "" && (
        <View className="rounded-md bg-surface-muted px-2 py-1">
          <Markdown small muted assetUrls={urls}>{q.explanation}</Markdown>
        </View>
      )}
    </View>
  );
}

export function NoAnswer() {
  return <Text className="text-sm italic text-muted">No answer</Text>;
}

// The right answer under one that wasn't fully right.
export function ResultKey({ q, full, urls }: { q: Question | RevealQuestion; full: boolean; urls: Urls }) {
  if (full) return null;
  return (
    <View className="flex-row flex-wrap items-baseline gap-1">
      <Text className="text-sm text-muted">Correct:</Text>
      <View className="flex-1">
        <Markdown inline small assetUrls={urls}>{answerKey(q)}</Markdown>
      </View>
    </View>
  );
}

// The answer on one line, with whatever the type adds under it (`children`).
export function YourAnswer({ q, answer, urls, children }: { q: Question | RevealQuestion; answer: AnswerValue; urls: Urls; children?: ReactNode }) {
  const yours = answerText(q, answer);
  return (
    <View className="gap-1">
      <View className="flex-row flex-wrap items-baseline gap-1">
        <Text className="text-sm text-muted">Your answer:</Text>
        <View className="flex-1">{yours ? <Markdown inline small assetUrls={urls}>{yours}</Markdown> : <NoAnswer />}</View>
      </View>
      {children}
    </View>
  );
}

// An answer in code or SQL, as typed.
export function CodeResult({ q, answer }: { q: Question | RevealQuestion; answer: AnswerValue }) {
  const yours = answerText(q, answer);
  if (!yours) return <NoAnswer />;
  return (
    <ScrollView horizontal className="max-h-72 rounded-md bg-surface-muted" contentContainerClassName="p-3">
      <Text className="text-xs text-foreground" style={{ fontFamily: "monospace" }}>
        {yours}
      </Text>
    </ScrollView>
  );
}

// An answer in words, shown as the markdown it is.
export function EssayResult({ q, answer, urls }: { q: Question | RevealQuestion; answer: AnswerValue; urls: Urls }) {
  const yours = answerText(q, answer);
  if (!yours) return <NoAnswer />;
  return (
    <View className="rounded-md bg-surface-muted p-3">
      <Markdown small assetUrls={urls}>{yours}</Markdown>
    </View>
  );
}

export function Mark({ correct }: { correct: boolean }) {
  return correct ? (
    <Text className="w-4 text-center font-bold text-success" accessibilityLabel="Correct">
      ✓
    </Text>
  ) : (
    <Text className="w-4 text-center font-bold text-danger" accessibilityLabel="Wrong">
      ✗
    </Text>
  );
}

// Each blank, pair or listed item with a mark for whether it matched the key. `prefix` goes before what was given
// (the left item of a pair) and `hint` after a wrong one (the right item).
export function PartsResult({
  parts,
  urls,
  prefix,
  hint,
}: {
  parts: readonly PartResult[];
  urls: Urls;
  prefix?: (index: number) => ReactNode;
  hint?: (index: number) => ReactNode;
}) {
  return (
    <View className="gap-1">
      {parts.map((part, k) => (
        <View key={k} className="flex-row items-start gap-2">
          <Mark correct={part.correct} />
          <View className="min-w-0 flex-1 flex-row flex-wrap items-baseline gap-1">
            {prefix?.(k)}
            {part.given ? <Markdown inline small assetUrls={urls}>{part.given}</Markdown> : <NoAnswer />}
            {!part.correct && hint?.(k)}
          </View>
        </View>
      ))}
    </View>
  );
}

// The prompt as the results screen shows it.
export function PlainPrompt({ q, urls }: { q: Question | RevealQuestion; urls: Urls }) {
  return <Markdown assetUrls={urls}>{q.prompt}</Markdown>;
}
