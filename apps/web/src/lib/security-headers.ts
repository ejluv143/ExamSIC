// Security headers for the web app. The proxy (src/proxy.ts) sends all of them with every page, the
// Content-Security-Policy with a fresh nonce each time. Nitro's route rules (vite.config.ts) add the fixed ones to
// everything else the built app serves, such as the files in public/.
import { createHash } from "node:crypto";
import { themeBootScript } from "./theme";

const production = process.env.NODE_ENV === "production";

// The headers that are the same on every response.
export function securityHeaders(production: boolean): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // For browsers without CSP frame-ancestors; nothing frames the app.
    "X-Frame-Options": "DENY",
    // Production is HTTPS only; locally the app runs on plain http://localhost.
    ...(production ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains" } : {}),
  };
}

function originOf(url: string | undefined) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// The other origins the browser talks to: the API's live WebSocket (see features/live/data.ts) and the image bucket,
// which signed image URLs and presigned uploads point at. S3_PUBLIC_ENDPOINT / S3_ENDPOINT mean the same as on the API.
// Read per request, like PUBLIC_API_URL, so changing them needs no rebuild.
function externalOrigins() {
  const api = originOf(process.env.PUBLIC_API_URL || process.env.API_URL);
  const live = api && api.replace(/^http/, "ws");
  const storage = originOf(process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT);
  return { live, storage };
}

// The root layout's inline theme script is allowed by its hash: the landing page is static, so it has no nonce to give.
const themeScriptHash = `'sha256-${createHash("sha256").update(themeBootScript).digest("base64")}'`;

// The page's headers: the fixed ones and a Content-Security-Policy for this nonce.
export function pageSecurityHeaders(nonce: string) {
  return { ...securityHeaders(production), "Content-Security-Policy": contentSecurityPolicy(nonce) };
}

export function contentSecurityPolicy(nonce: string) {
  const { live, storage } = externalOrigins();
  const sources = (...list: (string | null | false)[]) => list.filter(Boolean).join(" ");
  const directives = [
    "default-src 'self'",
    // The renderer's inline scripts (the RSC payload) carry the nonce. Pyodide and sql.js need WebAssembly;
    // React's development build uses eval for its error overlays.
    `script-src ${sources("'self'", `'nonce-${nonce}'`, themeScriptHash, "'wasm-unsafe-eval'", !production && "'unsafe-eval'")}`,
    // React renders style="" attributes, and KaTeX and the fonts add <style> blocks.
    "style-src 'self' 'unsafe-inline'",
    // data: for avatars and the exam watermark, blob: for images picked before they upload.
    `img-src ${sources("'self'", "data:", "blob:", storage)}`,
    "font-src 'self' data:",
    `connect-src ${sources("'self'", live, storage)}`,
    // The code runners (public/runners, public/sqljs) are same-origin workers.
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // Signing in with Google posts to a server action that redirects to Google.
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    production && "upgrade-insecure-requests",
  ];
  return directives.filter(Boolean).join("; ");
}
