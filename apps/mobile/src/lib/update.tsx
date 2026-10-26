// The app is older than the API accepts (`auth.config` `mobile.minVersion`, or `ClientOutdated` from the API while a
// quiz opens): a screen that blocks everything else and points to the update.
import { isOutdated } from "@examinus/domain/client";
import { Result } from "effect";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Linking, Text, View } from "react-native";
import { Button, Card } from "@/ui/components";
import { callResult } from "./api";
import { appVersion } from "./client-info";

type Outdated = { message: string; url: string | null } | null;

let current: Outdated = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// Shows the update screen. `url` is where the app is updated, if the API knows.
export function reportOutdated(message: string, url: string | null | undefined) {
  current = { message, url: url ? url : null };
  listeners.forEach((listener) => listener());
}

// What the update screen says when the API's own message isn't at hand (the launch check).
const outdatedMessage = (minVersion: string) => `This Examinus app (v${appVersion}) is out of date. Update to ${minVersion} or newer to continue.`;

// Renders `children` unless the app is outdated. Checked at launch against the API's minimum; a failed read lets the app
// carry on (the API still refuses an outdated client when it matters).
export function UpdateGate({ children }: { children: ReactNode }) {
  const outdated = useSyncExternalStore(subscribe, () => current);
  useEffect(() => {
    let live = true;
    void callResult((api) => api["auth.config"]())
      .then((result) => {
        if (!live || !Result.isSuccess(result)) return;
        const { minVersion, updateUrl } = result.success.mobile;
        if (isOutdated(appVersion, minVersion)) reportOutdated(outdatedMessage(minVersion), updateUrl);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (outdated === null) return <>{children}</>;
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
      <Card className="w-full items-center gap-3 p-8">
        <Text className="text-center text-xl font-semibold text-foreground" accessibilityRole="header">
          Update the app
        </Text>
        <Text className="text-center text-sm text-muted">{outdated.message}</Text>
        {outdated.url !== null && <Button onPress={() => void Linking.openURL(outdated.url!)}>Update Examinus</Button>}
      </Card>
    </View>
  );
}
