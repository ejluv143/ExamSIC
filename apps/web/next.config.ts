import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared RPC contract ships as TypeScript source.
  transpilePackages: ["@examora/contract"],
  // Browsers only talk to the web app. Better Auth's browser-driven endpoints (the Google OAuth callback)
  // live on the API, so forward them; the API's BETTER_AUTH_URL is this app's origin.
  async rewrites() {
    return [{ source: "/api/auth/:path*", destination: `${process.env.API_URL}/api/auth/:path*` }];
  },
};

export default nextConfig;
