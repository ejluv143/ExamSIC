import { orderingResults, parseOrderingAnswer } from "@examinus/domain/placement";
import { Pressable, Text, View } from "react-native";
import { ItemFace } from "./item-face";
import { NoAnswer, PlainPrompt, ResultFrame } from "./review-parts";
import type { KindInputProps, KindReviewProps } from "./types";

function MoveButton({ label, glyph, disabled, onPress }: { label: string; glyph: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      className={`h-10 w-10 items-center justify-center rounded-md border border-border bg-surface-muted ${disabled ? "opacity-30" : "active:bg-primary-soft"}`}
    >
      <Text className="text-base text-foreground">{glyph}</Text>
    </Pressable>
  );
}

// The items in a list with move up / move down buttons. The order shown is the student's saved order when it is a
// full permutation of the items, else the order they arrive in (already shuffled by the API); an untouched list is
// not an answer: `onChange` only fires when the student moves something.
export function Input({ question: q, value: answer, onChange, assetUrls, disabled }: KindInputProps<"ordering">) {
  const saved = parseOrderingAnswer(q, answer ?? undefined);
  const items = saved ? saved.map((id) => q.items.find((i) => i.id === id)) : q.items;
  const ids = items.map((i) => i?.id ?? "");

  const move = (from: number, to: number) => {
    if (disabled || from === to || to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(to, 0, ...next.splice(from, 1));
    onChange(next);
  };

  return (
    <View className="gap-2">
      <Text className="text-sm text-muted">Use the arrows to put the items in the correct order</Text>
      {items.map((item, i) => (
        <View key={item?.id ?? i} className="flex-row items-center gap-2 rounded-lg border border-border bg-surface p-2">
          <Text className="w-6 text-right text-sm text-muted">{i + 1}.</Text>
          <ItemFace item={item} assetUrls={assetUrls} />
          <MoveButton label={`Move item ${i + 1} up`} glyph="↑" disabled={disabled === true || i === 0} onPress={() => move(i, i - 1)} />
          <MoveButton
            label={`Move item ${i + 1} down`}
            glyph="↓"
            disabled={disabled === true || i === items.length - 1}
            onPress={() => move(i, i + 1)}
          />
        </View>
      ))}
    </View>
  );
}

export function Review({ question: q, answer, full, feedback, assetUrls: urls }: KindReviewProps<"ordering">) {
  const order = parseOrderingAnswer(q, answer);
  const results = orderingResults(q, answer);
  return (
    <View className="gap-2">
      <PlainPrompt q={q} urls={urls} />
      <ResultFrame q={q} urls={urls} feedback={feedback}>
        {order ? (
          <View className="gap-3">
            <View className="gap-1">
              <Text className="text-xs font-semibold uppercase text-muted">Your order</Text>
              {order.map((id, i) => {
                const correct = results[i]?.correct ?? false;
                return (
                  <View key={id} className={`flex-row items-start gap-2 rounded px-1.5 py-1 ${correct ? "bg-success-soft" : "bg-danger-soft"}`}>
                    <Text className="w-5 text-right text-sm text-muted">{i + 1}.</Text>
                    <Text className={`w-4 text-center font-bold ${correct ? "text-success" : "text-danger"}`} accessibilityLabel={correct ? "Correct" : "Wrong"}>
                      {correct ? "✓" : "✗"}
                    </Text>
                    <ItemFace item={q.items.find((it) => it.id === id)} assetUrls={urls} height={96} small />
                  </View>
                );
              })}
            </View>
            {!full && (
              <View className="gap-1">
                <Text className="text-xs font-semibold uppercase text-muted">Correct order</Text>
                {q.items.map((item, i) => (
                  <View key={item.id} className="flex-row items-start gap-2 rounded px-1.5 py-1">
                    <Text className="w-5 text-right text-sm text-muted">{i + 1}.</Text>
                    <ItemFace item={item} assetUrls={urls} height={96} small />
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : (
          <NoAnswer />
        )}
      </ResultFrame>
    </View>
  );
}
