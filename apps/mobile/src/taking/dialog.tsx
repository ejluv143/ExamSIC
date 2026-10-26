// A message or a question over the screen (`Alert.alert` does nothing in the web build, so the app draws its own).
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Modal } from "@/ui/modal";
import { Button } from "@/ui/components";

// `blocking`: nothing underneath can be used (no tap outside to close).
export function Dialog({ title, children, actions, blocking = false, onClose }: { title: string; children: ReactNode; actions?: ReactNode; blocking?: boolean; onClose?: () => void }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={blocking ? undefined : onClose}>
      <Pressable className={`flex-1 items-center justify-center p-4 ${blocking ? "bg-black/60" : "bg-black/40"}`} onPress={blocking ? undefined : onClose}>
        <Pressable className="max-h-[85%] w-full max-w-md rounded-xl border border-border bg-surface p-5" onPress={() => undefined} accessibilityRole="alert">
          <Text className="mb-2 text-lg font-semibold text-foreground" accessibilityRole="header">
            {title}
          </Text>
          <ScrollView>
            <View className="gap-2">{children}</View>
          </ScrollView>
          {actions !== undefined && <View className="mt-4 flex-row justify-end gap-2">{actions}</View>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function Confirm({ title, message, confirm, onConfirm, onCancel }: { title: string; message: string; confirm: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      actions={
        <>
          <Button variant="secondary" onPress={onCancel}>
            Cancel
          </Button>
          <Button onPress={onConfirm}>{confirm}</Button>
        </>
      }
    >
      <Text className="text-sm text-muted">{message}</Text>
    </Dialog>
  );
}
