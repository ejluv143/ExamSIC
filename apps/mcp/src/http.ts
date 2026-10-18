// MCP server over streamable HTTP at POST /mcp, for Cloud Run. Stateless: a fresh server per request, so any
// instance can answer any request. Every request must carry `Authorization: Bearer $EXAMINUS_MCP_TOKEN`.
import { createHash, timingSafeEqual } from "node:crypto";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "./server.ts";

const token = process.env.EXAMINUS_MCP_TOKEN;
if (!token) throw new Error("Set EXAMINUS_MCP_TOKEN: HTTP clients must send it as a bearer token.");
const expected = createHash("sha256").update(token).digest();

// Hashing first gives equal lengths, so the comparison time says nothing about the token.
function authorized(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  return timingSafeEqual(createHash("sha256").update(header.slice(7)).digest(), expected);
}

const mcp = createMcpHandler(createServer, { onerror: (error) => console.error(error) });

const server = Bun.serve({
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3002),
  async fetch(request) {
    if (new URL(request.url).pathname !== "/mcp") return new Response("Not found", { status: 404 });
    if (!authorized(request)) {
      return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": "Bearer" } });
    }
    return mcp.fetch(request);
  },
});
console.error(`examinus MCP server ready on ${server.url}mcp`);
