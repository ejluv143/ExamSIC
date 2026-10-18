// What every tool shares: the result shape (JSON text, or `isError` with the API's message) and small number helpers.
import type { CallToolResult } from "@modelcontextprotocol/server";
import { ApiError } from "./api.ts";

// Runs a tool body: its value becomes one JSON text content, a failure becomes `isError: true` with the message.
export async function run(body: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await body()) }] };
  } catch (error) {
    const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : String(error);
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}

export const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

export const round1 = (n: number) => Math.round(n * 10) / 10;

export const round2 = (n: number) => Math.round(n * 100) / 100;

// Milliseconds as seconds with one decimal; null stays null.
export const secondsOf = (ms: number | null) => (ms === null ? null : round1(ms / 1000));

export const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// The page's average: a whole percent.
export const averagePercent = (xs: readonly number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

// "Last, First", as the web app writes names.
export function fullName(s: { firstName: string; lastName: string }) {
  return `${s.lastName}, ${s.firstName}`;
}
