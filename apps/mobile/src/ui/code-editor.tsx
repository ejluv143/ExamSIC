// The code and SQL editor of the paper (the web's `CodeEditor`): the starter code to look at, and a monospace field
// to type in. Every change is reported as the one edit that turns the old text into the new, for the typing replay.
import type { EditHandler } from "@examinus/taking/typing";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useColors } from "./theme";

const mono = { fontFamily: "monospace" } as const;

// The text between the common start and the common end of the two texts is what was replaced.
export function replaceEdit(before: string, after: string): { from: number; to: number; insert: string } {
  let from = 0;
  const shortest = Math.min(before.length, after.length);
  while (from < shortest && before[from] === after[from]) from++;
  let end = 0;
  while (end < shortest - from && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  return { from, to: before.length - end, insert: after.slice(from, after.length - end) };
}

export function CodeEditor({
  value,
  starter,
  onChange,
  onEdit,
  disabled,
  label,
  minLines = 8,
}: {
  value: string;
  starter: string;
  onChange: (value: string) => void;
  onEdit?: EditHandler;
  disabled?: boolean;
  label: string;
  minLines?: number;
}) {
  const colors = useColors();
  const [showStarter, setShowStarter] = useState(false);
  const change = (next: string) => {
    if (next === value) return;
    onEdit?.([replaceEdit(value, next)]);
    onChange(next);
  };
  return (
    <View className="gap-2">
      {starter.trim() !== "" && (
        <View className="gap-1">
          <Pressable accessibilityRole="button" onPress={() => setShowStarter((s) => !s)}>
            <Text className="text-sm text-muted">{showStarter ? "▾" : "▸"} Starter code</Text>
          </Pressable>
          {showStarter && (
            <ScrollView horizontal className="max-h-48 rounded-md bg-surface-muted" contentContainerClassName="p-3">
              <Text selectable className="text-xs text-foreground" style={mono}>
                {starter}
              </Text>
            </ScrollView>
          )}
        </View>
      )}
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={change}
        editable={!disabled}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        textAlignVertical="top"
        placeholderTextColor={colors.muted}
        className="rounded-lg border border-border bg-surface-muted p-3 text-xs text-foreground"
        style={{ ...mono, minHeight: minLines * 18 + 24 }}
      />
    </View>
  );
}
