// Where the session token is kept on a phone: the keychain (iOS) or the keystore (Android).
import * as SecureStore from "expo-secure-store";

export const storage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};

// What Better Auth's Expo client stores its cookie and session cache in.
export const authStorage = SecureStore;
