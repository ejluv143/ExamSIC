import { useState } from "react";
import { Linking, Text } from "react-native";
import { WEB_URL } from "@/lib/env";
import { useSession, useUser } from "@/lib/session";
import { Button, Card, Notice, Screen } from "@/ui/components";

// Everyone who isn't a student (teachers, admins, guests) lands here: the app is for students.
export default function TeachersUseTheWeb() {
  const user = useUser();
  const { signOut, setOrganization } = useSession();
  const [error, setError] = useState<string | null>(null);
  // A person who is a teacher in one place may be a student in another organization.
  const studentOrgs = user.memberships.filter((m) => m.roles.includes("student") && m.id !== user.organization?.id);
  return (
    <Screen title="Teachers use the web app" description={`You're signed in as ${user.name}.`}>
      <Card className="gap-3 p-4">
        <Text className="text-foreground">Teaching, grading and settings are on the web. The app is for taking quizzes and exams and seeing your results.</Text>
        <Button onPress={() => void Linking.openURL(WEB_URL)}>Open the web app</Button>
      </Card>
      {studentOrgs.length > 0 && (
        <Card className="gap-3 p-4">
          <Text className="font-semibold text-foreground">Use the app as a student</Text>
          {error !== null && <Notice tone="danger">{error}</Notice>}
          {studentOrgs.map((org) => (
            <Button key={org.id} variant="secondary" onPress={() => void setOrganization(org.id).then(setError)}>
              {org.name}
            </Button>
          ))}
        </Card>
      )}
      <Button variant="secondary" onPress={() => void signOut()}>
        Sign out
      </Button>
    </Screen>
  );
}
