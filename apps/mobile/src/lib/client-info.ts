// How the app introduces itself to the API: `ExaminusMobile/<version> (<platform> <os version>)`, the user agent the
// API reads to know a request comes from the mobile app and which version (`clientOf`, packages/domain/src/client.ts).
import { mobileUserAgentToken } from "@examinus/domain/client";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

export const appVersion = Constants.expoConfig?.version ?? "0.0.0";

// "android 15", "ios 18.1", "browser" on Expo web.
export const platformLabel = Platform.OS === "web" ? "browser" : `${Platform.OS} ${Device.osVersion ?? ""}`.trim();

export const userAgent = `${mobileUserAgentToken}/${appVersion} (${platformLabel})`;

// `fetch` with the app's user agent. A browser forbids setting it (Expo web), so there the call goes out unchanged.
export const mobileFetch = ((input, init) => {
  if (Platform.OS === "web") return globalThis.fetch(input, init);
  const request = input instanceof Request ? input : null;
  const headers = new Headers(init?.headers ?? request?.headers);
  headers.set("User-Agent", userAgent);
  return globalThis.fetch(request ?? input, { ...init, headers });
}) as typeof globalThis.fetch;
