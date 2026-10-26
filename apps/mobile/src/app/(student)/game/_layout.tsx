import { Stack } from "expo-router";

// A game fills the screen; there is nothing to navigate to inside it.
export default function GameLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
