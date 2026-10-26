import { Stack } from "expo-router";

// A mastery session fills the screen; there is nothing to navigate to inside it.
export default function MasteryLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
