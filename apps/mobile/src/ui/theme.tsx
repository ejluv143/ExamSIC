// Light and dark colours from `@examinus/theme`, handed to NativeWind as CSS variables so `bg-background`,
// `text-muted` and `bg-primary` follow the phone's appearance, as the web's classes follow its mode.
import { accents, colorVars, defaultAccent, modeColors, type ThemeMode } from "@examinus/theme/tokens";
import { vars } from "nativewind";
import { useMemo, type ReactNode } from "react";
import { View, useColorScheme } from "react-native";

const modeOf = (scheme: ReturnType<typeof useColorScheme>): ThemeMode => (scheme === "dark" ? "dark" : "light");

export function AppTheme({ children }: { children: ReactNode }) {
  const mode = modeOf(useColorScheme());
  const style = useMemo(() => vars(colorVars(mode)), [mode]);
  return (
    <View style={[{ flex: 1 }, style]} className="bg-background">
      {children}
    </View>
  );
}

// The same colours as values, for what NativeWind classes can't reach (navigation bars, the refresh spinner).
export function useColors() {
  const mode = modeOf(useColorScheme());
  return { mode, ...modeColors[mode], ...accents[defaultAccent][mode], primaryForeground: accents[defaultAccent][mode].foreground };
}
