import { nitro } from "nitro/vite";
import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  // nitro adapts the vinext server build to the host platform (auto-detects Vercel in CI).
  plugins: [vinext(), nitro()],
  // Same port rule as the built server (`npm start`) and `next dev` before it: PORT, else 3000.
  server: { port: Number(process.env.PORT) || 3000, strictPort: true },
  // Bundle effect into the rsc/ssr builds. Left external, Nitro splits `effect/rpc` and `effect/http` into
  // _libs/effect.mjs with their own copy of effect's Schema, while `effect` itself is inlined elsewhere; the RPC
  // client then encodes payloads from the contract's schemas as `{}` (the API answers "Missing key").
  environments: {
    rsc: { resolve: { noExternal: ["effect"] } },
    ssr: { resolve: { noExternal: ["effect"] } },
  },
});
