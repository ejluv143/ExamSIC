// MCP server over streamable HTTP at POST /mcp, for Cloud Run. Stateless: a fresh server per request, so any
// instance can answer any request. Clients sign a teacher in with OAuth: the API is the authorization server
// (Better Auth's mcp plugin, apps/rpc/src/features/auth/BetterAuth.ts), this server the protected resource. Each
// request's access token is checked here, then sent on to the API, which acts as the teacher it was issued to.
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { withAccessToken } from "./api.ts";
import { createServer } from "./server.ts";

const port = Number(process.env.PORT ?? 3002);
// This endpoint's public URL: the audience of the tokens, the same as the API's MCP_RESOURCE_URL.
const resource = process.env.EXAMINUS_MCP_RESOURCE ?? `http://127.0.0.1:${port}/mcp`;
// The web app's origin forwards /api/auth to the API, so the OAuth server lives under it.
const issuer = `${(process.env.EXAMINUS_WEB_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/api/auth`;
const resourcePath = new URL(resource).pathname;

// RFC 9728: where clients learn which authorization server issues tokens for this endpoint. The 401 points at the
// path-suffixed form; clients may also ask at the bare one.
const metadataPath = `/.well-known/oauth-protected-resource${resourcePath}`;
const metadata = JSON.stringify({ resource, authorization_servers: [issuer], bearer_methods_supported: ["header"] });
const challenge = `Bearer resource_metadata="${new URL(metadataPath, resource)}"`;

// The API's signing keys, fetched once and again when a token names an unknown key.
const jwks = createRemoteJWKSet(new URL(`${issuer}/jwks`));

const mcp = createMcpHandler(createServer, { onerror: (error) => console.error(error) });

const server = Bun.serve({
  hostname: process.env.HOST ?? "127.0.0.1",
  port,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === metadataPath || pathname === "/.well-known/oauth-protected-resource") {
      return new Response(metadata, { headers: { "content-type": "application/json" } });
    }
    if (pathname !== resourcePath) return new Response("Not found", { status: 404 });
    // An access token the API issued for this endpoint, not expired; anything else starts the sign-in.
    const token = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
    const valid = token && (await jwtVerify(token, jwks, { issuer, audience: resource, typ: "at+jwt" }).then(() => true, () => false));
    if (!token || !valid) return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": challenge } });
    return withAccessToken(token, () => mcp.fetch(request));
  },
});
console.error(`examinus MCP server ready on ${server.url}${resourcePath.slice(1)} (resource ${resource}, issuer ${issuer})`);
