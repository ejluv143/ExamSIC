import { useState } from "react";
import { Text, View } from "react-native";
import { appVersion, platformLabel } from "@/lib/client-info";
import { useSession, useUser } from "@/lib/session";
import { Badge, Button, Card, CardTitle, Notice, Row, Screen } from "@/ui/components";

// Who you're signed in as, the organization you use the app in (as the web's switcher), the app version, and sign out.
export default function Settings() {
  const user = useUser();
  const { signOut, setOrganization } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  async function switchTo(id: string | null) {
    setSwitching(id ?? "personal");
    setError(await setOrganization(id));
    setSwitching(null);
  }

  return (
    <Screen title="Settings">
      <Card>
        <CardTitle>Account</CardTitle>
        <Row>
          <View className="flex-1">
            <Text className="font-medium text-foreground">{user.name}</Text>
            <Text className="text-sm text-muted">{user.email}</Text>
          </View>
        </Row>
      </Card>
      <Card>
        <CardTitle>Organization</CardTitle>
        {error !== null && (
          <View className="p-3">
            <Notice tone="danger">{error}</Notice>
          </View>
        )}
        {user.memberships.map((m) => (
          <Row key={m.id} onPress={user.organization?.id === m.id ? undefined : () => void switchTo(m.id)}>
            <Text className="flex-1 text-foreground">{m.name}</Text>
            {user.organization?.id === m.id ? <Badge tone="primary">Active</Badge> : <Text className="text-sm text-muted">{switching === m.id ? "Switching…" : "Switch"}</Text>}
          </Row>
        ))}
        <Row onPress={user.organization === null ? undefined : () => void switchTo(null)}>
          <Text className="flex-1 text-foreground">Personal space</Text>
          {user.organization === null ? <Badge tone="primary">Active</Badge> : <Text className="text-sm text-muted">{switching === "personal" ? "Switching…" : "Switch"}</Text>}
        </Row>
      </Card>
      <Card>
        <CardTitle>About</CardTitle>
        <Row>
          <Text className="flex-1 text-foreground">Version</Text>
          <Text className="text-sm text-muted">
            {appVersion} · {platformLabel}
          </Text>
        </Row>
      </Card>
      <Button variant="danger" onPress={() => void signOut()}>
        Sign out
      </Button>
    </Screen>
  );
}
