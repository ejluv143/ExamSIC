// The small set of building blocks the screens share; classes are the web's token names (`bg-surface`, `text-muted`).
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View, type TextInputProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Loaded } from "@/lib/use-load";
import { useColors } from "./theme";

export function Screen({ children, load, title, description }: { children: ReactNode; load?: Loaded<unknown>; title?: string; description?: ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4"
      contentContainerStyle={{ paddingTop: insets.top + 16 }}
      refreshControl={load ? <RefreshControl refreshing={load.refreshing} onRefresh={() => void load.refresh()} tintColor={colors.primary} /> : undefined}
    >
      {title !== undefined && (
        <View>
          <Text className="text-2xl font-semibold text-foreground" accessibilityRole="header">
            {title}
          </Text>
          {description !== undefined && <Text className="mt-1 text-sm text-muted">{description}</Text>}
        </View>
      )}
      {children}
    </ScrollView>
  );
}

// The loading and error states of a loaded screen; renders `children(data)` once there is data.
export function Loadable<A>({ load, children }: { load: Loaded<A>; children: (data: A) => ReactNode }) {
  if (load.data !== null) return <>{children(load.data)}</>;
  if (load.loading) return <ActivityIndicator className="mt-8" />;
  return <Notice tone="danger">{load.error ?? "Something went wrong."}</Notice>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <View className={`overflow-hidden rounded-xl border border-border bg-surface ${className}`}>{children}</View>;
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
      <Text className="font-semibold text-foreground">{children}</Text>
      {action}
    </View>
  );
}

export function EmptyState({ title }: { title: string }) {
  return (
    <View className="items-center px-4 py-8">
      <Text className="text-sm text-muted">{title}</Text>
    </View>
  );
}

type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";
const toneClass: Record<Tone, { box: string; text: string }> = {
  neutral: { box: "bg-surface-muted", text: "text-muted" },
  primary: { box: "bg-primary-soft", text: "text-primary" },
  success: { box: "bg-success-soft", text: "text-success" },
  warning: { box: "bg-warning-soft", text: "text-warning" },
  danger: { box: "bg-danger-soft", text: "text-danger" },
  info: { box: "bg-info-soft", text: "text-info" },
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <View className={`self-start rounded-full px-2 py-0.5 ${toneClass[tone].box}`}>
      <Text className={`text-xs font-medium ${toneClass[tone].text}`}>{children}</Text>
    </View>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: Exclude<Tone, "neutral" | "primary"> }) {
  return (
    <View className={`rounded-lg p-3 ${toneClass[tone].box}`} accessibilityRole="alert">
      <Text className={`text-sm ${toneClass[tone].text}`}>{children}</Text>
    </View>
  );
}

export function Button({
  children,
  onPress,
  variant = "primary",
  disabled = false,
  busy = false,
}: {
  children: ReactNode;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  busy?: boolean;
}) {
  const box = variant === "primary" ? "bg-primary" : variant === "danger" ? "bg-danger-soft" : "border border-border bg-surface";
  const text = variant === "primary" ? "text-primary-foreground" : variant === "danger" ? "text-danger" : "text-foreground";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      className={`min-h-11 items-center justify-center rounded-lg px-4 py-2.5 active:opacity-80 ${box} ${disabled || busy ? "opacity-50" : ""}`}
    >
      {busy ? <ActivityIndicator /> : <Text className={`font-medium ${text}`}>{children}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...input }: { label: string } & TextInputProps) {
  const colors = useColors();
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        className="min-h-11 rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
        {...input}
      />
    </View>
  );
}

// A row inside a card, tappable when `onPress` is given.
export function Row({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const body = <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">{children}</View>;
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} className="active:bg-surface-muted">
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="min-w-[45%] flex-1 p-3">
      <Text className="text-xs text-muted">{label}</Text>
      <Text className="mt-1 text-2xl font-semibold text-foreground">{value}</Text>
      {hint !== undefined && <Text className="text-xs text-muted">{hint}</Text>}
    </Card>
  );
}
