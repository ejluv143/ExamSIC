import { clientIpHeader, internalSecretHeader } from "@examinus/contract/api";
import { describe, expect, test } from "bun:test";
import { resolveClientIp } from "./network.ts";

// `headers` arrive over HTTP and are also what the caller sends, unless `sent` says otherwise (an RPC message's own).
const resolve = (
  headers: Record<string, string>,
  { remoteAddress = "203.0.113.9", internalSecret = "", trustedProxyHops = 0, sent = headers }: Partial<{
    remoteAddress: string | null;
    internalSecret: string;
    trustedProxyHops: number;
    sent: Record<string, string>;
  }> = {},
) => resolveClientIp({ transport: headers, sent, remoteAddress, internalSecret, trustedProxyHops });

describe("resolveClientIp", () => {
  test("never trusts the leftmost x-forwarded-for entry", () => {
    expect(resolve({ "x-forwarded-for": "10.0.4.5" })).toBe("203.0.113.9");
    expect(resolve({ "x-forwarded-for": "10.0.4.5, 198.51.100.7" }, { trustedProxyHops: 1 })).toBe("198.51.100.7");
  });

  test("counts trusted proxies from the right", () => {
    const headers = { "x-forwarded-for": "10.0.4.5, 198.51.100.7, 192.0.2.1" };
    expect(resolve(headers, { trustedProxyHops: 2 })).toBe("198.51.100.7");
  });

  test("uses the socket when the request skipped the proxies", () => {
    expect(resolve({}, { trustedProxyHops: 1 })).toBe("203.0.113.9");
    expect(resolve({}, { remoteAddress: "::ffff:198.51.100.7" })).toBe("198.51.100.7");
  });

  test("believes the web app's address only with the secret", () => {
    const sent = { [clientIpHeader]: "10.0.4.5" };
    expect(resolve(sent, { internalSecret: "s3cret" })).toBe("203.0.113.9");
    expect(resolve({ ...sent, [internalSecretHeader]: "wrong" }, { internalSecret: "s3cret" })).toBe("203.0.113.9");
    expect(resolve({ ...sent, [internalSecretHeader]: "s3cret" }, { internalSecret: "s3cret" })).toBe("10.0.4.5");
  });

  test("without a secret, believes only a caller on loopback", () => {
    const sent = { [clientIpHeader]: "10.0.4.5" };
    expect(resolve(sent)).toBe("203.0.113.9");
    expect(resolve(sent, { remoteAddress: "127.0.0.1" })).toBe("10.0.4.5");
    expect(resolve(sent, { remoteAddress: "::1" })).toBe("10.0.4.5");
    // A spoofed x-forwarded-for can't pass for loopback when no proxy is trusted.
    expect(resolve({ ...sent, "x-forwarded-for": "127.0.0.1" })).toBe("203.0.113.9");
  });

  test("x-forwarded-for inside an RPC message is the caller's word, not a proxy's", () => {
    const sent = { "x-forwarded-for": "10.0.4.5", [clientIpHeader]: "10.0.4.5" };
    expect(resolve({}, { sent, trustedProxyHops: 1 })).toBe("203.0.113.9");
  });

  test("the web app's secret and address may come inside the message", () => {
    const sent = { [clientIpHeader]: "10.0.4.5", [internalSecretHeader]: "s3cret" };
    expect(resolve({}, { sent, internalSecret: "s3cret" })).toBe("10.0.4.5");
  });

  test("refuses values that aren't addresses", () => {
    expect(resolve({ [clientIpHeader]: "not-an-ip" }, { remoteAddress: "127.0.0.1" })).toBeNull();
    expect(resolve({}, { remoteAddress: null })).toBeNull();
  });
});
