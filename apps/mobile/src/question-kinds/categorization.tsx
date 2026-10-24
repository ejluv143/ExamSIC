import { categorizationResults, encodeCategorizationAnswer, parseCategorizationAnswer } from "@examinus/domain/placement";
import { plainText } from "@examinus/question-kinds-core/plain-text";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Markdown } from "@/markdown/markdown";
import { ItemFace } from "./item-face";
import { PlainPrompt, ResultFrame } from "./review-parts";
import type { KindInputProps, KindReviewProps } from "./types";

// Items are sorted into categories: tap an item, then tap a category (or "Unsorted") to place it. Items left in the
// pool are unsorted (the right place for a distractor). The answer holds only the sorted items and is null while
// nothing is sorted.
export function Input({ question: q, value: answer, onChange, assetUrls, disabled }: KindInputProps<"categorization">) {
  const [selected, setSelected] = useState<string | null>(null);
  const known = parseCategorizationAnswer(typeof answer === "string" ? answer : undefined);
  const sorted: Record<string, string> = {};
  for (const item of q.items) {
    const categoryId = known[item.id];
    if (categoryId && q.categories.some((c) => c.id === categoryId)) sorted[item.id] = categoryId;
  }

  const place = (itemId: string, to: string | null) => {
    if (disabled) return;
    const next = { ...sorted };
    if (to === null) delete next[itemId];
    else next[itemId] = to;
    setSelected(null);
    onChange(Object.keys(next).length === 0 ? null : encodeCategorizationAnswer(next));
  };

  const card = (item: (typeof q.items)[number]) => {
    const on = selected === item.id;
    return (
      <Pressable
        key={item.id}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`Item ${plainText(item.text) || item.alt || "Picture"}`}
        disabled={disabled}
        onPress={() => setSelected(on ? null : item.id)}
        className={`flex-row rounded-lg border p-2 ${on ? "border-primary bg-primary-soft" : "border-border bg-surface"}`}
      >
        <ItemFace item={item} assetUrls={assetUrls} height={80} small />
      </Pressable>
    );
  };
  const itemsIn = (categoryId: string | null) => q.items.filter((i) => (sorted[i.id] ?? null) === categoryId);
  const pool = itemsIn(null);
  const hint = selected === null ? "Tap an item, then tap the category it belongs in" : "Now tap a category to place the item";

  return (
    <View className="gap-3">
      <Text className="text-sm text-muted">{disabled ? "Items sorted into categories" : hint}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Unsorted items"
        disabled={disabled || selected === null}
        onPress={() => selected !== null && place(selected, null)}
        className={`min-h-16 gap-2 rounded-lg border bg-surface-muted p-3 ${selected !== null && sorted[selected] ? "border-primary" : "border-border"}`}
      >
        <Text className="text-xs font-semibold uppercase text-muted">Unsorted</Text>
        {pool.map(card)}
        {pool.length === 0 && <Text className="text-xs text-muted">Every item is in a category.</Text>}
      </Pressable>
      {q.categories.map((c) => {
        const inside = itemsIn(c.id);
        const target = selected !== null && sorted[selected] !== c.id;
        return (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityLabel={`Category ${plainText(c.name)}`}
            disabled={disabled || selected === null}
            onPress={() => selected !== null && place(selected, c.id)}
            className={`min-h-24 gap-2 rounded-lg border border-dashed bg-surface p-3 ${target ? "border-primary bg-primary-soft" : "border-border"}`}
          >
            <View>
              <Text className="text-sm font-semibold text-foreground">{c.name}</Text>
              {c.description !== undefined && c.description !== "" && (
                <Markdown small muted assetUrls={assetUrls}>{c.description}</Markdown>
              )}
            </View>
            {inside.map(card)}
            {inside.length === 0 && <Text className="text-xs text-muted">No items here</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Review({ question: q, answer, feedback, assetUrls: urls }: KindReviewProps<"categorization">) {
  const results = categorizationResults(q, answer);
  const given = parseCategorizationAnswer(answer);
  const boxes = [
    ...q.categories.map((c) => ({ id: c.id as string | null, name: c.name, description: c.description })),
    { id: null as string | null, name: "Unsorted", description: undefined },
  ];
  return (
    <View className="gap-2">
      <PlainPrompt q={q} urls={urls} />
      <ResultFrame q={q} urls={urls} feedback={feedback}>
        <View className="gap-2">
          {boxes.map((box) => {
            // Only items the student placed show in a category; the rest of the items are unsorted.
            const placed = results.filter((r) => (box.id === null ? r.given === null : r.given === box.id));
            return (
              <View key={box.id ?? "unsorted"} className="rounded-md border border-border p-2">
                <Text className="text-xs font-semibold uppercase text-muted">{box.name}</Text>
                {box.description !== undefined && box.description !== "" && (
                  <Markdown small muted assetUrls={urls}>{box.description}</Markdown>
                )}
                {placed.length === 0 ? (
                  <Text className="mt-1 text-xs italic text-muted">{box.id === null ? "Nothing left unsorted" : "Nothing here"}</Text>
                ) : (
                  <View className="mt-1 gap-1">
                    {placed.map((r) => {
                      const item = q.items.find((i) => i.id === r.itemId);
                      const right = item?.categoryId ?? null;
                      return (
                        <View key={r.itemId} className={`gap-1 rounded px-1.5 py-1 ${r.correct ? "bg-success-soft" : "bg-danger-soft"}`}>
                          <View className="flex-row items-start gap-2">
                            <Text className={`w-4 text-center font-bold ${r.correct ? "text-success" : "text-danger"}`} accessibilityLabel={r.correct ? "Correct" : "Wrong"}>
                              {r.correct ? "✓" : "✗"}
                            </Text>
                            <ItemFace item={item} assetUrls={urls} height={80} small />
                          </View>
                          {!r.correct && (
                            <Text className="pl-6 text-xs text-success">
                              {right === null
                                ? "Belongs nowhere (leave unsorted)"
                                : `Belongs in ${plainText(q.categories.find((c) => c.id === right)?.name ?? "—")}`}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
          <Text className="text-xs text-muted">
            {results.filter((r) => r.correct).length} of {results.length} items in the right place
            {Object.keys(given).length === 0 ? "; nothing was sorted" : ""}
          </Text>
        </View>
      </ResultFrame>
    </View>
  );
}
