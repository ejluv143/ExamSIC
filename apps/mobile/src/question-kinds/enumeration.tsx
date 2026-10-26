import { partResults } from "@examinus/domain/scoring";
import { Text, View } from "react-native";
import { GuardedTextInput } from "@/ui/guarded-input";
import { Badge } from "@/ui/components";
import { useColors } from "@/ui/theme";
import { PartsResult, PlainPrompt, ResultFrame, ResultKey, YourAnswer } from "./review-parts";
import type { KindInputProps, KindReviewProps } from "./types";

export function Input({ question: q, value, onChange, disabled = false }: KindInputProps<"enumeration">) {
  const colors = useColors();
  const given = Array.isArray(value) ? value : [];
  return (
    <View className="gap-2">
      {Array.from({ length: q.itemCount }, (_, i) => (
        <View key={i} className="flex-row items-center gap-2">
          <Text className="w-5 text-right text-sm text-muted">{i + 1}.</Text>
          <GuardedTextInput
            value={given[i] ?? ""}
            onChangeText={(text) => {
              const next = Array.from({ length: q.itemCount }, (_, j) => given[j] ?? "");
              next[i] = text;
              onChange(next);
            }}
            editable={!disabled}
            accessibilityLabel={`Item ${i + 1}`}
            placeholderTextColor={colors.muted}
            className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
          />
        </View>
      ))}
      {q.orderMatters && <Badge>Order matters</Badge>}
    </View>
  );
}

export function Review({ question: q, answer, full, feedback, assetUrls }: KindReviewProps<"enumeration">) {
  const parts = partResults(q, answer);
  return (
    <View className="gap-3">
      <PlainPrompt q={q} urls={assetUrls} />
      <ResultFrame q={q} urls={assetUrls} feedback={feedback}>
        {parts ? <PartsResult parts={parts} urls={assetUrls} /> : <YourAnswer q={q} answer={answer} urls={assetUrls} />}
        <ResultKey q={q} full={full} urls={assetUrls} />
      </ResultFrame>
    </View>
  );
}
