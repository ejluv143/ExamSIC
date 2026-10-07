// Client network addresses: where a request came from, and whether a session's allowlist admits it.
import { BlockList, isIP } from "node:net";

// The student's address as the web app forwards it (the first x-forwarded-for entry), without the IPv4-in-IPv6 prefix.
export function clientIp(headers: Readonly<Record<string, string | undefined>>): string | null {
  const first = headers["x-forwarded-for"]?.split(",")[0]?.trim();
  if (!first) return null;
  const plain = first.replace(/^::ffff:/i, "");
  return isIP(plain) ? plain : null;
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
