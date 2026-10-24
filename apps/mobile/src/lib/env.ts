// The app's two settings, inlined by Expo at build time (`EXPO_PUBLIC_*`, see .env.example). A missing one is a setup
// mistake, so it fails loudly at start instead of calling a wrong address.
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const webUrl = process.env.EXPO_PUBLIC_WEB_URL;

function required(name: string, value: string | undefined): string {
  if (!value || !URL.canParse(value)) throw new Error(`${name} must be set to an http(s) URL; see apps/mobile/.env.example.`);
  return value.replace(/\/+$/, "");
}

// The API's origin (no path), e.g. https://api.examinus.app.
export const API_URL = required("EXPO_PUBLIC_API_URL", apiUrl);
// The web app's origin, for what the app leaves to the web.
export const WEB_URL = required("EXPO_PUBLIC_WEB_URL", webUrl);
