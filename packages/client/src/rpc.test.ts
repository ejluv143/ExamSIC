import { describe, expect, test } from "bun:test";
import { authHeaders } from "./rpc.ts";

describe("authHeaders", () => {
  test("cookie strategy returns its headers", async () => {
    expect(await authHeaders({ kind: "cookie", headers: () => ({ cookie: "a=b" }) })).toEqual({ cookie: "a=b" });
  });

  test("bearer strategy sets the authorization header from the current token", async () => {
    let token: string | null = "one";
    const auth = { kind: "bearer", token: async () => token } as const;
    expect(await authHeaders(auth)).toEqual({ authorization: "Bearer one" });
    token = "two";
    expect(await authHeaders(auth)).toEqual({ authorization: "Bearer two" });
  });

  test("bearer strategy without a token sends no credentials", async () => {
    expect(await authHeaders({ kind: "bearer", token: async () => null })).toEqual({});
  });
});
