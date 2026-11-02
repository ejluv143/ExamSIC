// The lobby every session mode shares: who you are, what you're in, and two tabs: the lobby itself (status, relay
// board, Play button: whatever the caller puts inside) and the session's anti-cheating rules.
import { integrityRules } from "@examinus/domain/integrity";
import type { IntegritySettings } from "@examinus/domain/quiz";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

type Tab = "lobby" | "integrity";

const tabs: { id: Tab; label: string }[] = [
  { id: "lobby", label: "Lobby" },
  { id: "integrity", label: "Anti-cheating" },
];

export function LobbyStage({
  header,
  avatar,
  title,
  subtitle,
  integrity,
  kind,
  children,
}: {
  header?: ReactNode;
  avatar: ReactNode;
  title: string;
  subtitle?: string;
  integrity: IntegritySettings;
  kind: string;
  children: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("lobby");
  const rules = integrityRules(integrity, kind);
  return (
    <View className="w-full flex-1 gap-4">
      {header}
      <View className="w-full flex-1 items-center justify-center gap-4">
        {avatar}
        <Text className="text-center text-3xl font-semibold text-foreground">{title}</Text>
        {subtitle !== undefined && <Text className="text-center text-sm text-muted">{subtitle}</Text>}
        <View accessibilityRole="tablist" className="w-full flex-row gap-2 rounded-full bg-surface-muted p-1">
          {tabs.map((t) => (
            <Pressable
              key={t.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.id }}
              onPress={() => setTab(t.id)}
              className={`flex-1 items-center rounded-full py-2 ${tab === t.id ? "bg-background" : ""}`}
            >
              <Text className={`text-sm font-medium ${tab === t.id ? "text-foreground" : "text-muted"}`}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        {tab === "lobby" ? (
          <View className="w-full items-center gap-4">{children}</View>
        ) : (
          <View className="w-full gap-2">
            <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
              Anti-cheating
            </Text>
            {rules.length === 0 ? (
              <Text className="text-sm text-muted">No anti-cheating rules for this {kind}.</Text>
            ) : (
              rules.map((rule) => (
                <Text key={rule} className="text-sm text-foreground">
                  {"•  "}
                  {rule}
                </Text>
              ))
            )}
          </View>
        )}
      </View>
    </View>
  );
}
