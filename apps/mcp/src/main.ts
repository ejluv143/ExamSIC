// MCP server (stdio) that lets an AI client act as a signed-in Examinus teacher. See README.md.
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.ts";

// stdout carries the protocol: anything else goes to stderr.
await createServer().connect(new StdioServerTransport());
console.error("examinus MCP server ready on stdio");
