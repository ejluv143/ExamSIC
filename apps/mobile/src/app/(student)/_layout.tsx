import { Tabs } from "expo-router";
import { useColors } from "@/ui/theme";

// The student's area: four tabs. The results screens open from the home and have no tab of their own.
export default function StudentLayout() {
  const colors = useColors();
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarIconStyle: { display: "none" },
        tabBarLabelStyle: { fontSize: 14, marginBottom: 12 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="standing" options={{ title: "Standing" }} />
      <Tabs.Screen name="attendance" options={{ title: "Attendance" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
      <Tabs.Screen name="take" options={{ title: "Take", tabBarItemStyle: { display: "none" }, tabBarStyle: { display: "none" } }} />
      <Tabs.Screen name="results" options={{ title: "Results", tabBarItemStyle: { display: "none" } }} />
      <Tabs.Screen name="game" options={{ title: "Game", tabBarItemStyle: { display: "none" }, tabBarStyle: { display: "none" } }} />
      <Tabs.Screen name="mastery" options={{ title: "Mastery", tabBarItemStyle: { display: "none" }, tabBarStyle: { display: "none" } }} />
    </Tabs>
  );
}
