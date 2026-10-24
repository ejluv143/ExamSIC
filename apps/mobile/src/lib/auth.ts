// Sign-in with Better Auth's Expo client, and the session token the API calls need.
//
// Email sign-in answers with the session token in the `set-auth-token` header (the API's bearer plugin). Google
// sign-in runs in the system browser and comes back to the app through the `examinus://` scheme; the Expo client
// keeps the session cookie it receives, and the token is that cookie's value. Either way the token is kept in
// `storage` and sent as `Authorization: Bearer` (see api.ts).
import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { Platform } from "react-native";
import { API_URL } from "./env";
import { mobileFetch } from "./client-info";
import { authStorage, storage } from "./storage";

const tokenKey = "examinus_session_token";

const authClient = createAuthClient({
  baseURL: API_URL,
  // `omit`: the token travels as a header; a browser build (Expo web) would otherwise send cookies cross-origin, which the API's CORS answer refuses.
  fetchOptions: { customFetchImpl: mobileFetch, credentials: "omit" },
  plugins: [expoClient({ scheme: "examinus", storagePrefix: "examinus", storage: authStorage })],
});

export const getToken = () => storage.get(tokenKey);

// Email and password. Returns an error message for the person, or null when signed in.
export async function signInWithEmail(email: string, password: string): Promise<string | null> {
  let token: string | null = null;
  const { error } = await authClient.signIn.email(
    { email, password },
    { onSuccess: (context) => void (token = context.response.headers.get("set-auth-token")) },
  );
  if (error) return error.message || "Email or password is wrong.";
  if (!token) return "The API didn't return a session. Check that the app points at the Examinus API.";
  await storage.set(tokenKey, token);
  return null;
}

// The session token inside the cookie the Expo client keeps ("examinus.session_token=<token>; ...").
const sessionTokenIn = (cookie: string) => {
  const entry = cookie.split("; ").find((part) => /session_token=/.test(part));
  return entry ? decodeURIComponent(entry.slice(entry.indexOf("=") + 1)) : null;
};

// Google, in the system browser. Returns an error message, or null when signed in. Closing the browser, or an account
// Examinus doesn't know (Google never creates one here), ends without a session.
export async function signInWithGoogle(): Promise<string | null> {
  if (Platform.OS === "web") return "Google sign-in is available in the Examinus app.";
  const { error } = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
  if (error) return error.message || "Google sign-in failed.";
  const token = sessionTokenIn(await authClient.getCookie());
  if (!token) return "Google sign-in didn't finish. Use the account your school registered, or sign in with email.";
  await storage.set(tokenKey, token);
  return null;
}

// Forgets the session here: the token, and the cookie and session cache the Expo client keeps. Ending it on the API is
// the caller's part (`auth.signOut`, with the token, before this).
export async function forgetSession(): Promise<void> {
  await authClient.signOut().catch(() => undefined);
  await storage.remove(tokenKey);
}
