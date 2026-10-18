// An MCP client (Gemini, Claude) signing a teacher in through the API's OAuth server (Better Auth's mcp plugin).
// Without a session, /api/auth/oauth2/authorize sends the browser to /login with the authorization request and a
// signature. Once signed in, the browser goes back to the authorize endpoint with the original request, which then
// shows /oauth/consent or returns to the client.

export const authorizePath = "/api/auth/oauth2/authorize";

// Parameters Better Auth adds to sign the request for the login page; the authorize endpoint doesn't take them.
const signing: Record<string, true> = { sig: true, exp: true, ba_iat: true, ba_param: true };

// The authorize URL to resume, when /login was opened by the authorize endpoint; null for a normal sign-in.
export function oauthResumeUrl(searchParams: Record<string, string | string[] | undefined>): string | null {
  if (typeof searchParams.sig !== "string" || typeof searchParams.client_id !== "string") return null;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value !== "string" || signing[key] || key === "next") continue;
    // They have just signed in: asking for it again would send them back here.
    if (key === "prompt") {
      const rest = value.split(" ").filter((p) => p !== "login" && p !== "");
      if (rest.length) query.set(key, rest.join(" "));
      continue;
    }
    query.set(key, value);
  }
  return `${authorizePath}?${query}`;
}

// Whether a `next` from the login form resumes an authorization request (so it may leave the user's own area).
export const isOAuthResume = (next: string) => next.startsWith(`${authorizePath}?`);
