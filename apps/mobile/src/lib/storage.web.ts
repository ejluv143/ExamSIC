// Expo's web build (used to check the app in a browser) has no secure store: `localStorage` stands in.
export const storage = {
  get: async (key: string) => globalThis.localStorage.getItem(key),
  set: async (key: string, value: string) => globalThis.localStorage.setItem(key, value),
  remove: async (key: string) => globalThis.localStorage.removeItem(key),
};

// Better Auth's Expo client does nothing on the web (the browser keeps its cookies), but it still needs a storage object.
export const authStorage = {
  getItem: (key: string) => globalThis.localStorage.getItem(key),
  getItemAsync: async (key: string) => globalThis.localStorage.getItem(key),
  setItem: (key: string, value: string) => globalThis.localStorage.setItem(key, value),
  setItemAsync: async (key: string, value: string) => globalThis.localStorage.setItem(key, value),
};
