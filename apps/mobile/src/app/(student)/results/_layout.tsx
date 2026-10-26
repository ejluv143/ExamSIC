import { Stack } from "expo-router";

// The scores list and one result, opened from the home; the tab bar stays.
export default function ResultsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
