// Polyfills first: Effect and Better Auth need `crypto.getRandomValues` before any other module loads.
import "./src/polyfills";
import "expo-router/entry";
