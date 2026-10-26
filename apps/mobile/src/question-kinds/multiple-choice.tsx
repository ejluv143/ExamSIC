import { Pressable, Text, View } from "react-native";
import { AssetImage, Markdown } from "@/markdown/markdown";
import { PlainPrompt, ResultFrame, ResultKey, YourAnswer } from "./review-parts";
import type { KindInputProps, KindReviewProps } from "./types";

const letter = (i: number) => String.fromCharCode(65 + i);

export function Input({ question: q, value: answer, onChange, assetUrls, tap, disabled = false }: KindInputProps<"multiple_choice">) {
  const value = Array.isArray(answer) || typeof answer === "string" ? answer : undefined;
  if (tap)
    return (
      <View className="gap-3">
        {q.choices.map((c, i) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            disabled={tap.disabled || disabled}
            onPress={() => {
              onChange(c.id);
              tap.submit(c.id);
            }}
            className={`min-h-16 justify-center rounded-xl px-5 py-4 active:opacity-80 ${tap.styles[i % tap.styles.length]!.tile} ${value === c.id ? "border-4 border-foreground" : ""} ${tap.disabled || disabled ? "opacity-50" : ""}`}
          >
            <Markdown inline assetUrls={assetUrls} color={tap.styles[i % tap.styles.length]!.text}>
              {c.text || "(image)"}
            </Markdown>
          </Pressable>
        ))}
      </View>
    );
  const picked = q.multipleCorrect ? (Array.isArray(value) ? value : []) : [typeof value === "string" ? value : ""];
  return (
    <View className="gap-2">
      {q.multipleCorrect && <Text className="text-xs text-muted">Select all that apply.</Text>}
      {q.choices.map((c, i) => {
        const checked = picked.includes(c.id);
        return (
          <Pressable
            key={c.id}
            accessibilityRole={q.multipleCorrect ? "checkbox" : "radio"}
            accessibilityState={{ checked, disabled }}
            disabled={disabled}
            onPress={() => onChange(q.multipleCorrect ? (checked ? picked.filter((x) => x !== c.id) : [...picked, c.id]) : c.id)}
            className={`gap-2 rounded-lg border px-3 py-3 ${checked ? "border-primary bg-primary-soft" : "border-border bg-surface"}`}
          >
            {c.imageId !== undefined && <AssetImage id={c.imageId} alt={c.alt ?? ""} assetUrls={assetUrls} />}
            <View className="flex-row items-center gap-3">
              <View
                className={`h-5 w-5 items-center justify-center border-2 ${q.multipleCorrect ? "rounded" : "rounded-full"} ${checked ? "border-primary bg-primary" : "border-muted"}`}
              >
                {checked && <Text className="text-xs font-bold text-primary-foreground">✓</Text>}
              </View>
              <Text className="font-medium text-muted">{letter(i)}.</Text>
              <View className="min-w-0 flex-1">
                <Markdown inline assetUrls={assetUrls}>{c.text}</Markdown>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Review({ question: q, answer, full, feedback, assetUrls }: KindReviewProps<"multiple_choice">) {
  const given = Array.isArray(answer) ? answer : typeof answer === "string" ? [answer] : [];
  return (
    <View className="gap-3">
      <PlainPrompt q={q} urls={assetUrls} />
      <ResultFrame q={q} urls={assetUrls} feedback={feedback}>
        <YourAnswer q={q} answer={answer} urls={assetUrls}>
          {q.choices
            .filter((c) => c.imageId !== undefined && given.includes(c.id))
            .map((c) => (
              <AssetImage key={c.id} id={c.imageId!} alt={c.alt ?? ""} assetUrls={assetUrls} height={120} />
            ))}
        </YourAnswer>
        <ResultKey q={q} full={full} urls={assetUrls} />
      </ResultFrame>
    </View>
  );
}
