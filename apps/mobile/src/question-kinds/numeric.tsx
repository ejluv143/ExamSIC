import { parseNumber } from "@examinus/question-kinds-core/math";
import { Text, TextInput, View } from "react-native";
import { useColors } from "@/ui/theme";
import { PlainPrompt, ResultFrame, ResultKey, YourAnswer } from "./review-parts";
import type { KindInputProps, KindReviewProps } from "./types";

export function Input({ question: q, value, onChange, disabled = false }: KindInputProps<"numeric">) {
  const colors = useColors();
  const text = typeof value === "string" ? value : "";
  const n = parseNumber(text);
  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-2">
        <TextInput
          value={text}
          onChangeText={onChange}
          editable={!disabled}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Your answer"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Your answer"
          className="min-h-11 w-48 rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
        />
        {q.unit !== "" && <Text className="text-sm text-muted">{q.unit}</Text>}
      </View>
      <Text className="text-xs text-muted">
        {text.trim() !== "" && n === null ? "Type a number, like 12, -3.5, 3/4 or 1 1/2." : "Numbers only. Fractions like 3/4 are fine."}
      </Text>
    </View>
  );
}

export function Review({ question: q, answer, full, feedback, assetUrls }: KindReviewProps<"numeric">) {
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
