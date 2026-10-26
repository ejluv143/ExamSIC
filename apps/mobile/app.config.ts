import { existsSync } from "node:fs";
import path from "node:path";
import type { ExpoConfig } from "expo/config";
import pkg from "./package.json";

// `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_URL` are read by the app at run time (src/lib/env.ts); the build only
// needs to know whether the API is plain http, which Android blocks unless the build allows it.
const cleartext = (process.env.EXPO_PUBLIC_API_URL ?? "").startsWith("http://");

// EAS Update. `EAS_PROJECT_ID` comes from `eas init` (or the Expo dashboard); without it updates stay off. Updates are
// signed only when the public certificate is in the repo (`certs/certificate.pem`, made with
// `npx expo-updates codesigning:generate`; see README). The private key never is.
const easProjectId = process.env.EAS_PROJECT_ID ?? "";
const signed = existsSync(path.join(__dirname, "certs", "certificate.pem"));

const config: ExpoConfig = {
  name: "Examinus",
  slug: "examinus",
  version: pkg.version,
  scheme: "examinus",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  ios: { bundleIdentifier: "app.examinus.student", supportsTablet: true },
  android: {
    package: "app.examinus.student",
    adaptiveIcon: { foregroundImage: "./assets/icon.png", backgroundColor: "#ffffff" },
  },
  web: { bundler: "metro", output: "single", favicon: "./assets/icon.png" },
  // The Google Cloud project number linked to Play Integrity; read by the app through Constants (`mobile-platform.ts`).
  extra: {
    playIntegrityProject: process.env.EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT ?? "",
    eas: { projectId: easProjectId },
  },
  // An update only reaches builds with the same app version, so JS that needs new native code never reaches an old build.
  runtimeVersion: { policy: "appVersion" },
  updates: easProjectId
    ? {
        url: `https://u.expo.dev/${easProjectId}`,
        ...(signed
          ? {
              codeSigningCertificate: "./certs/certificate.pem",
              codeSigningMetadata: { keyid: "main", alg: "rsa-v1_5-sha256" },
            }
          : {}),
      }
    : { enabled: false },
  plugins: [
    "expo-router",
    "expo-secure-store",
    ["expo-splash-screen", { image: "./assets/icon.png", imageWidth: 160, backgroundColor: "#ffffff" }],
    ["expo-build-properties", { android: { usesCleartextTraffic: cleartext } }],
    "./plugins/with-app-attest.js",
  ],
};

export default config;
