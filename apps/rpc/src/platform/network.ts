// Client network addresses: where a request came from, and whether a session's allowlist admits it.
import { BlockList, isIP } from "node:net";
import { createHash, timingSafeEqual } from "node:crypto";
import { clientIpHeader, internalSecretHeader } from "@examinus/contract/api";

// An address without the IPv4-in-IPv6 prefix, or null when it isn't one.
function plainIp(text: string | undefined): string | null {
  const plain = text?.trim().replace(/^::ffff:/i, "");
  return plain && isIP(plain) ? plain : null;
}

// The client's address, as `resolveClientIp` settled it at the edge (main.ts runs it on every request): whatever a
// caller sent in `clientIpHeader`, or in x-forwarded-for, has already been replaced.
export function clientIp(headers: Readonly<Record<string, string | undefined>>): string | null {
  return plainIp(headers[clientIpHeader]);
}

const isLoopback = (ip: string | null) => ip !== null && (ip === "::1" || /^127\./.test(ip));

const sameSecret = (sent: string, expected: string) =>
  timingSafeEqual(createHash("sha256").update(sent).digest(), createHash("sha256").update(expected).digest());

// Where a request came from. The web app's server calls for browsers and names their address in `clientIpHeader`;
// that is believed only with the shared secret (API_INTERNAL_SECRET), or with no secret set, from loopback (the web
// app and the API on one machine, as in development). Anyone else (the desktop and mobile apps, a direct caller) gets
// their own address: with `trustedProxyHops` proxies in front of the API, the x-forwarded-for entry that many hops
// from the right (each proxy appends the address it saw, so entries further left are whatever the caller sent); with
// none, or when the request skipped them, the socket's address. The leftmost entry is never trusted.
// `transport` is what the proxies and the socket report (the HTTP headers); `sent` is what the caller says, which
// for an RPC includes the headers inside the message, where the web app's client puts them.
export function resolveClientIp(request: {
  transport: Readonly<Record<string, string | undefined>>;
  sent: Readonly<Record<string, string | undefined>>;
  remoteAddress: string | null;
  internalSecret: string;
  trustedProxyHops: number;
}): string | null {
  const { transport, sent, internalSecret, trustedProxyHops } = request;
  const forwardedFor = transport["x-forwarded-for"]?.split(",").map((e) => e.trim()).filter(Boolean) ?? [];
  const hop = trustedProxyHops > 0 ? forwardedFor.at(-trustedProxyHops) : undefined;
  const own = plainIp(hop ?? request.remoteAddress ?? undefined);
  const secret = sent[internalSecretHeader];
  const fromWeb = internalSecret ? secret !== undefined && sameSecret(secret, internalSecret) : isLoopback(own);
  return fromWeb ? clientIp(sent) : own;
}

type Entry = { address: string; prefix: number | null; family: "ipv4" | "ipv6" };

// "10.0.4.0/24" or "192.168.1.5"; null when it isn't an address or range.
function parseEntry(text: string): Entry | null {
  const [address = "", rest, ...extra] = text.trim().split("/");
  const version = isIP(address);
  if (!version || extra.length > 0) return null;
  if (rest === undefined) return { address, prefix: null, family: version === 4 ? "ipv4" : "ipv6" };
  const prefix = Number(rest);
  const max = version === 4 ? 32 : 128;
  return /^\d+$/.test(rest) && prefix <= max ? { address, prefix, family: version === 4 ? "ipv4" : "ipv6" } : null;
}

// The first entry that isn't a valid address or range, or null when the list is fine.
export const invalidAllowlistEntry = (list: readonly string[]) => list.find((e) => parseEntry(e) === null) ?? null;

// An empty list admits everyone. Otherwise an address must be inside one of the entries; an unknown address is refused.
export function ipAllowed(ip: string | null, list: readonly string[]): boolean {
  if (list.length === 0) return true;
  if (ip === null) return false;
  const allowed = new BlockList();
  for (const text of list) {
    const e = parseEntry(text);
    if (!e) continue;
    if (e.prefix === null) allowed.addAddress(e.address, e.family);
    else allowed.addSubnet(e.address, e.prefix, e.family);
  }
  return allowed.check(ip, isIP(ip) === 4 ? "ipv4" : "ipv6");
}
