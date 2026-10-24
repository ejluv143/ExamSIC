import { Pressable, Text, View } from "react-native";
import { PlainPrompt, ResultFrame, ResultKey, YourAnswer } from "./review-parts";
import type { KindInputProps, KindReviewProps } from "./types";

export function Input({ value, onChange, tap, disabled = false }: KindInputProps<"true_false">) {
  if (tap)
    return (
      <View className="flex-row gap-3">
        {[true, false].map((v, i) => (
          <Pressable
            key={String(v)}
            accessibilityRole="button"
            disabled={tap.disabled || disabled}
            onPress={() => {
              onChange(v);
              tap.submit(v);
            }}
            className={`min-h-20 flex-1 items-center justify-center rounded-xl active:opacity-80 ${tap.styles[i % tap.styles.length]!.tile} ${value === v ? "border-4 border-foreground" : ""} ${tap.disabled || disabled ? "opacity-50" : ""}`}
          >
            <Text className="text-2xl font-bold" style={{ color: tap.styles[i % tap.styles.length]!.text }}>
              {v ? "True" : "False"}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  return (
    <View className="flex-row gap-2">
      {[true, false].map((v) => (
        <Pressable
          key={String(v)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === v, disabled }}
          disabled={disabled}
          onPress={() => onChange(v)}
          className={`min-h-11 flex-1 items-center justify-center rounded-lg border px-4 py-2.5 ${value === v ? "border-primary bg-primary-soft" : "border-border bg-surface"}`}
        >
          <Text className={`text-sm font-medium ${value === v ? "text-primary" : "text-foreground"}`}>{v ? "True" : "False"}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Review({ question: q, answer, full, feedback, assetUrls }: KindReviewProps<"true_false">) {
  return (
    <View className="gap-3">
      <PlainPrompt q={q} urls={assetUrls} />
      <ResultFrame q={q} urls={assetUrls} feedback={feedback}>
        <YourAnswer q={q} answer={answer} urls={assetUrls} />
        <ResultKey q={q} full={full} urls={assetUrls} />
      </ResultFrame>
    </View>
  );
}
