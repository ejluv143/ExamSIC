import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vinext()],
  // Same port rule as `vinext start` (and `next dev` before it): PORT, else 3000.
  server: { port: Number(process.env.PORT) || 3000, strictPort: true },
});
