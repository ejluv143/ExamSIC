import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared domain model and RPC contract ship as TypeScript source.
  transpilePackages: ["@examinus/domain", "@examinus/contract"],
  // A drawing answer carries every stroke point (up to 100,000), more than the 1 MB default allows.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Browsers only talk to the web app. Better Auth's browser-driven endpoints (the Google OAuth callback, the OAuth
  // server MCP clients sign in through) live on the API, so forward them; the API's BETTER_AUTH_URL is this app's
  // origin. MCP clients look for the OAuth server's metadata at the origin's root, with the issuer's path (/api/auth)
  // after it (RFC 8414); Better Auth serves it under /api/auth.
  async rewrites() {
    const api = process.env.API_URL;
    return [
      { source: "/api/auth/:path*", destination: `${api}/api/auth/:path*` },
      {
        source: "/.well-known/oauth-authorization-server/api/auth",
        destination: `${api}/api/auth/.well-known/oauth-authorization-server`,
      },
      { source: "/.well-known/openid-configuration/api/auth", destination: `${api}/api/auth/.well-known/openid-configuration` },
    ];
  },
};

export default nextConfig;
