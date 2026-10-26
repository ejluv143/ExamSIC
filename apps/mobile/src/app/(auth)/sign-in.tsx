import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { callApi } from "@/lib/api";
import { WEB_URL } from "@/lib/env";
import { useSession } from "@/lib/session";
import { useLoad } from "@/lib/use-load";
import { Button, Card, Field, Notice, Screen } from "@/ui/components";

const loadConfig = () => callApi((api) => api["auth.config"]());

export default function SignIn() {
  const { signIn, signInGoogle } = useSession();
  const config = useLoad(loadConfig);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"email" | "google" | null>(null);

  async function run(kind: "email" | "google", action: () => Promise<string | null>) {
    setBusy(kind);
    setError(null);
    const message = await action().catch((e: unknown) => (e instanceof Error ? e.message : "Something went wrong."));
    setBusy(null);
    if (message) setError(message);
  }

  return (
    <Screen title="Examinus" description="Sign in with the account your school gave you.">
      <Card className="gap-3 p-4">
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password" />
        {error !== null && <Notice tone="danger">{error}</Notice>}
        <Button busy={busy === "email"} disabled={busy !== null || email.trim() === "" || password === ""} onPress={() => void run("email", () => signIn(email.trim(), password))}>
          Sign in
        </Button>
        {config.data?.google === true && (
          <Button variant="secondary" busy={busy === "google"} disabled={busy !== null} onPress={() => void run("google", signInGoogle)}>
            Continue with Google
          </Button>
        )}
      </Card>
      {config.error !== null && <Notice tone="warning">{config.error}</Notice>}
      <View className="items-center">
        <Text className="text-sm text-muted" onPress={() => void Linking.openURL(`${WEB_URL}/register`)} accessibilityRole="link">
          No account yet? Register on the web.
        </Text>
      </View>
    </Screen>
  );
}
