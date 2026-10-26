// What Effect and Better Auth expect from the JavaScript runtime and Hermes lacks. Imported first (index.ts).
// `TextEncoder`, `AbortController`, `structuredClone`, `fetch` and `WebSocket` are provided by React Native and
// Expo's runtime; `crypto.getRandomValues` and `crypto.randomUUID` are not.
import "react-native-get-random-values";
import * as Crypto from "expo-crypto";

const target = globalThis.crypto as Partial<Crypto> | undefined;
if (target && typeof target.randomUUID !== "function") {
  Object.defineProperty(target, "randomUUID", { value: () => Crypto.randomUUID(), configurable: true, writable: true });
}
