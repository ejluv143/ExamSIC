import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared RPC contract ships as TypeScript source.
  transpilePackages: ["@examora/contract"],
  // A drawing answer carries every stroke point (up to 100,000), more than the 1 MB default allows.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // The photos on the sign-in and sign-up pages.
  images: { remotePatterns: [new URL("https://images.unsplash.com/photo-*")] },
  // Browsers only talk to the web app. Better Auth's browser-driven endpoints (the Google OAuth callback)
  // live on the API, so forward them; the API's BETTER_AUTH_URL is this app's origin.
  async rewrites() {
    return [{ source: "/api/auth/:path*", destination: `${process.env.API_URL}/api/auth/:path*` }];
  },
};

export default nextConfig;
