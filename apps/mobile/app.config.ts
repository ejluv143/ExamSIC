import type { ExpoConfig } from "expo/config";
import pkg from "./package.json";

// `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_URL` are read by the app at run time (src/lib/env.ts); the build only
// needs to know whether the API is plain http, which Android blocks unless the build allows it.
const cleartext = (process.env.EXPO_PUBLIC_API_URL ?? "").startsWith("http://");

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
  plugins: [
    "expo-router",
    "expo-secure-store",
    ["expo-splash-screen", { image: "./assets/icon.png", imageWidth: 160, backgroundColor: "#ffffff" }],
    ["expo-build-properties", { android: { usesCleartextTraffic: cleartext } }],
  ],
};

export default config;
