import { partResults } from "@examinus/domain/scoring";
import { plainText } from "@examinus/question-kinds-core/plain-text";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Modal } from "@/ui/modal";
import { Markdown } from "@/markdown/markdown";
import { ItemFace } from "./item-face";
import { PartsResult, PlainPrompt, ResultFrame, YourAnswer } from "./review-parts";
import type { KindInputProps, KindReviewProps } from "./types";

// Each left item gets one of the right items, picked from a sheet listing them. The same right item may go with
// several left items. The answer is the list of right ids by left index ("" for an empty one).
export function Input({ question: q, value: answer, onChange, assetUrls, disabled }: KindInputProps<"matching">) {
  const [picking, setPicking] = useState<number | null>(null);
  const value = Array.isArray(answer) ? answer : undefined;
  const given = q.left.map((_, i) => value?.[i] ?? "");
  const right = (id: string) => q.right.find((r) => r.id === id);
  const set = (i: number, id: string) => onChange(given.map((x, j) => (j === i ? id : x)));

  return (
    <View className="gap-3">
      {q.left.map((item, i) => {
        const placed = right(given[i] ?? "");
        return (
          <View key={item.id} className="gap-1.5 rounded-lg border border-border bg-surface p-2">
            <View className="flex-row gap-2">
              <Text className="text-sm text-muted">{i + 1}.</Text>
              <ItemFace item={item} assetUrls={assetUrls} height={128} />
            </View>
            <View className="flex-row items-center gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Match for item ${i + 1}${placed ? `: ${plainText(placed.text) || placed.alt || "Picture"}` : ", empty"}`}
                disabled={disabled}
                onPress={() => setPicking(i)}
                className="min-h-12 min-w-0 flex-1 flex-row items-center rounded-lg border border-dashed border-border bg-surface-muted px-2 py-1.5 active:bg-primary-soft"
              >
                {placed ? <ItemFace item={placed} assetUrls={assetUrls} /> : <Text className="text-sm text-muted">Choose a match</Text>}
              </Pressable>
              {placed && !disabled && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Clear the match for item ${i + 1}`}
                  onPress={() => set(i, "")}
                  hitSlop={8}
                  className="h-10 w-10 items-center justify-center rounded-md active:bg-surface-muted"
                >
                  <Text className="text-lg text-muted">✕</Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
      <Modal visible={picking !== null && !disabled} transparent animationType="slide" onRequestClose={() => setPicking(null)}>
        <View className="flex-1 justify-end bg-black/50">
          <Pressable accessibilityLabel="Close" className="flex-1" onPress={() => setPicking(null)} />
          <View className="max-h-[75%] rounded-t-2xl bg-surface p-3">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="font-semibold text-foreground">{picking !== null ? `Match for item ${picking + 1}` : ""}</Text>
              <Pressable accessibilityRole="button" onPress={() => setPicking(null)} hitSlop={8}>
                <Text className="text-sm font-medium text-primary">Cancel</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerClassName="gap-2 pb-4">
              {q.right.map((r) => {
                const selected = picking !== null && given[picking] === r.id;
                return (
                  <Pressable
                    key={r.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      if (picking !== null) set(picking, r.id);
                      setPicking(null);
                    }}
                    className={`rounded-lg border p-3 ${selected ? "border-primary bg-primary-soft" : "border-border bg-surface active:bg-surface-muted"}`}
                  >
                    <ItemFace item={r} assetUrls={assetUrls} height={120} />
                  </Pressable>
                );
              })}
              {picking !== null && given[picking] !== "" && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    set(picking, "");
                    setPicking(null);
                  }}
                  className="rounded-lg border border-border p-3 active:bg-surface-muted"
                >
                  <Text className="text-sm text-muted">Clear the match</Text>
                </Pressable>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function Review({ question: q, answer, full, feedback, assetUrls: urls }: KindReviewProps<"matching">) {
  const parts = partResults(q, answer);
  return (
    <View className="gap-2">
      <PlainPrompt q={q} urls={urls} />
      <ResultFrame q={q} urls={urls} feedback={feedback}>
        {parts ? (
          <PartsResult
            parts={parts}
            urls={urls}
            prefix={(k) => (
              <>
                <Markdown inline small assetUrls={urls}>{q.left[k]?.text ?? ""}</Markdown>
                <Text className="text-sm text-muted"> → </Text>
              </>
            )}
            hint={(k) =>
              full ? null : (
                <Text className="text-sm text-success">
                  ({q.right.find((r) => r.id === q.left[k]?.rightId)?.text ?? ""})
                </Text>
              )
            }
          />
        ) : (
          <YourAnswer q={q} answer={answer} urls={urls} />
        )}
      </ResultFrame>
    </View>
  );
}
