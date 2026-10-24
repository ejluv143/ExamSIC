import { Stack } from "expo-router";

// A quiz being taken: no tab bar and no header.
export default function TakeLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
