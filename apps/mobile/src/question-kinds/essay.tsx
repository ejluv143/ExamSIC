import { Text, TextInput, View } from "react-native";
import { useColors } from "@/ui/theme";
import { EssayResult, PlainPrompt, ResultFrame } from "./review-parts";
import type { KindInputProps, KindReviewProps } from "./types";

// The essay is written in markdown; the box is plain multiline text.
export function Input({ value, onChange, disabled = false }: KindInputProps<"essay">) {
  const colors = useColors();
  const text = typeof value === "string" ? value : "";
  return (
    <View className="gap-1">
      <TextInput
        value={text}
        onChangeText={onChange}
        editable={!disabled}
        multiline
        textAlignVertical="top"
        placeholder="Write your answer…"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Your answer"
        className="min-h-48 rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
      />
      <Text className="text-right text-xs text-muted">{text.trim() === "" ? 0 : text.trim().split(/\s+/).length} words</Text>
    </View>
  );
}

export function Review({ question: q, answer, feedback, assetUrls }: KindReviewProps<"essay">) {
  return (
    <View className="gap-3">
      <PlainPrompt q={q} urls={assetUrls} />
      <ResultFrame q={q} urls={assetUrls} feedback={feedback}>
        <EssayResult q={q} answer={answer} urls={assetUrls} />
      </ResultFrame>
    </View>
  );
}
