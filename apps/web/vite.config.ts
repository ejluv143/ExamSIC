import { nitro } from "nitro/vite";
import vinext from "vinext";
import { defineConfig } from "vite";
import { securityHeaders } from "./src/lib/security-headers";

export default defineConfig(({ command }) => ({
  // nitro adapts the vinext server build to the host platform (auto-detects Vercel in CI). Its route rules put the
  // fixed security headers on everything the built app serves; pages also get them, with their CSP, from src/proxy.ts.
  plugins: [vinext(), nitro({ routeRules: { "/**": { headers: securityHeaders(command === "build") } } })],
  // Same port rule as the built server (`npm start`) and `next dev` before it: PORT, else 3000.
  server: { port: Number(process.env.PORT) || 3000, strictPort: true },
  // Bundle effect into the rsc/ssr builds. Left external, Nitro splits `effect/rpc` and `effect/http` into
  // _libs/effect.mjs with their own copy of effect's Schema, while `effect` itself is inlined elsewhere; the RPC
  // client then encodes payloads from the contract's schemas as `{}` (the API answers "Missing key").
  environments: {
    rsc: { resolve: { noExternal: ["effect"] } },
    ssr: { resolve: { noExternal: ["effect"] } },
  },
}));
