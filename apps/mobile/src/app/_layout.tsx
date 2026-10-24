import "../../global.css";
import { roleOf } from "@examinus/domain/roles";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SessionProvider, useSession } from "@/lib/session";
import { AppTheme, useColors } from "@/ui/theme";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SessionProvider>
      <AppTheme>
        <Routes />
      </AppTheme>
    </SessionProvider>
  );
}

// Which area the person sees follows the session: sign-in when signed out, the student area for a student, and a page
// pointing teachers (and everyone else) to the web app.
function Routes() {
  const { state } = useSession();
  const colors = useColors();
  useEffect(() => {
    if (state.status !== "loading") void SplashScreen.hideAsync();
  }, [state.status]);
  if (state.status === "loading") return null;

  const signedIn = state.status === "in";
  const student = signedIn && roleOf(state.user) === "student";
  const base = colors.mode === "dark" ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, background: colors.background, card: colors.surface, text: colors.foreground, border: colors.border, primary: colors.primary },
  };
  return (
    <ThemeProvider value={theme}>
      <StatusBar style={colors.mode === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={student}>
          <Stack.Screen name="(student)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !student}>
          <Stack.Screen name="teacher" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
