// A choice from a list in a sheet over the screen: the phone's dropdown.
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Modal } from "@/ui/modal";

export function Picker({
  value,
  options,
  onChange,
  label,
  placeholder = "Choose…",
  disabled = false,
  renderOption,
  trigger,
}: {
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  renderOption?: (option: { value: string; label: string }) => ReactNode;
  // Draws the closed control; the default is a bordered field with the chosen label.
  trigger?: (chosen: { value: string; label: string } | undefined) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.value === value);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className="min-h-9 flex-row items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 active:bg-surface-muted"
      >
        {trigger ? (
          trigger(chosen)
        ) : (
          <>
            <Text className={chosen ? "text-foreground" : "text-muted"}>{chosen?.label || placeholder}</Text>
            <Text className="text-xs text-muted">▾</Text>
          </>
        )}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setOpen(false)}>
          <Pressable className="max-h-[70%] rounded-t-2xl border-t border-border bg-surface p-4" onPress={() => undefined}>
            <Text className="mb-2 font-semibold text-foreground">{label}</Text>
            <ScrollView>
              <View className="gap-1">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="rounded-lg px-3 py-3 active:bg-surface-muted"
                >
                  <Text className="text-muted">{placeholder}</Text>
                </Pressable>
                {options.map((o) => (
                  <Pressable
                    key={o.value}
                    accessibilityRole="button"
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={`rounded-lg px-3 py-3 active:bg-surface-muted ${o.value === value ? "bg-primary-soft" : ""}`}
                  >
                    {renderOption ? renderOption(o) : <Text className="text-foreground">{o.label}</Text>}
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
