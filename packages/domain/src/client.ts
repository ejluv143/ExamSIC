// Which client a request comes from (the browser, the desktop app or the mobile app) and the semantic versions the
// API, the apps and the releases are numbered with. The apps announce themselves in their user agent; the API reads
// it from the headers the web app forwards (the mobile app sends its own), and refuses a build older than the version
// it requires.
import { Schema } from "effect";

export const clientKinds = ["web", "desktop", "mobile"] as const;
export type ClientKind = (typeof clientKinds)[number];
export const ClientKindSchema = Schema.Literals(clientKinds);

export type Client = { kind: "web" } | { kind: "desktop"; version: string } | { kind: "mobile"; version: string };

export const clientKindLabel: Record<ClientKind, string> = { web: "Web browser", desktop: "Desktop app", mobile: "Mobile app" };

// What a client says about itself when it opens a paper or starts an attempt: its kind, its version and the system it
// runs on ("windows", "macos", "linux", "android 15", "ios 18", "browser"). The API takes the kind and version from the
// user agent too (`resolveClient`), so the kind is only believed where the two agree.
export const ClientInfo = Schema.Struct({
  kind: ClientKindSchema,
  version: Schema.String,
  platform: Schema.String,
});
export type ClientInfo = typeof ClientInfo.Type;

// The client an attempt was started from, as kept with it. `attested`: the device passed the platform's integrity
// check (`client.attest`) for this attempt.
export const AttemptClient = Schema.Struct({
  kind: ClientKindSchema,
  version: Schema.String,
  platform: Schema.String,
  attested: Schema.Boolean,
});
export type AttemptClient = typeof AttemptClient.Type;

// "Web browser", "Desktop 1.2.0 · Windows", "Mobile 1.0.0 · Android 15", with " · verified" when attested. null: an
// attempt from before the client was recorded.
export function clientLabel(client: AttemptClient | null): string {
  if (client === null) return "Not recorded";
  const platform = client.platform.charAt(0).toUpperCase() + client.platform.slice(1);
  const app = `${client.kind === "desktop" ? "Desktop" : "Mobile"} ${client.version}`.trim();
  const text = client.kind === "web" ? clientKindLabel.web : [app, platform].filter((p) => p !== "").join(" · ");
  return client.attested ? `${text} · verified` : text;
}

// The short text of a badge in the live view: "Mobile · Android 15", "Desktop · Windows", "Web browser" (no version; the
// drawer and the report have `clientLabel` for that). Whether it was verified is shown next to it.
export function clientBadgeText(client: AttemptClient): string {
  if (client.kind === "web") return clientKindLabel.web;
  const platform = client.platform.charAt(0).toUpperCase() + client.platform.slice(1);
  return [client.kind === "desktop" ? "Desktop" : "Mobile", platform].filter((p) => p !== "").join(" · ");
}

// Whether a session may be taken from this client; a missing list means all of them.
export function clientAllowed(allowed: readonly ClientKind[] | undefined, kind: ClientKind): boolean {
  return allowed === undefined || allowed.includes(kind);
}

// The token the desktop app appends to its user agent: `ExaminusDesktop/1.4.0`.
export const desktopUserAgentToken = "ExaminusDesktop";
const desktopPattern = new RegExp(`\\b${desktopUserAgentToken}/(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?)`);

// The token the mobile app appends to its user agent: `ExaminusMobile/1.0.0`.
export const mobileUserAgentToken = "ExaminusMobile";
const mobilePattern = new RegExp(`\\b${mobileUserAgentToken}/(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?)`);

// What the user agent says this is. Anything that isn't one of the apps is the web.
export function clientOf(userAgent: string | undefined): Client {
  const desktop = userAgent ? desktopPattern.exec(userAgent) : null;
  if (desktop) return { kind: "desktop", version: desktop[1]! };
  const mobile = userAgent ? mobilePattern.exec(userAgent) : null;
  return mobile ? { kind: "mobile", version: mobile[1]! } : { kind: "web" };
}

// Release tags on GitHub: one series per app, so the desktop app and the API are versioned apart.
export const desktopTagPrefix = "desktop-v";
export const apiTagPrefix = "rpc-v";

export type Semver = { major: number; minor: number; patch: number; prerelease: readonly string[] };

// One semantic version: `1.2.3`, with an optional leading `v`, pre-release and build metadata.
export const semverPattern = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

// `1.2.3`, `v1.2.3`, `1.2.3-beta.1`, `1.2.3+build`; null for anything else.
export function parseSemver(text: string): Semver | null {
  const match = semverPattern.exec(text.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

// Semantic Versioning 2.0 precedence: numbers first, then a pre-release sorts before its release, and pre-release
// identifiers compare numerically when both are numbers, else as strings, else the shorter list first.
export function compareSemver(a: Semver, b: Semver): -1 | 0 | 1 {
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    if (a.prerelease.length === b.prerelease.length) return 0;
    return a.prerelease.length === 0 ? 1 : -1;
  }
  const n = Math.min(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < n; i++) {
    const x = a.prerelease[i]!;
    const y = b.prerelease[i]!;
    if (x === y) continue;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) return Number(x) < Number(y) ? -1 : 1;
    if (xn !== yn) return xn ? -1 : 1;
    return x < y ? -1 : 1;
  }
  if (a.prerelease.length === b.prerelease.length) return 0;
  return a.prerelease.length < b.prerelease.length ? -1 : 1;
}

// Whether `version` is older than `minimum`. A version that can't be parsed counts as outdated.
export function isOutdated(version: string, minimum: string): boolean {
  const have = parseSemver(version);
  const need = parseSemver(minimum);
  if (!need) return false;
  if (!have) return true;
  return compareSemver(have, need) < 0;
}

// The GitHub page listing a repository's releases, and the page of one release tag.
export const releasesUrl = (repo: string) => `https://github.com/${repo}/releases`;
export const releaseUrl = (repo: string, tag: string) => `${releasesUrl(repo)}/tag/${encodeURIComponent(tag)}`;
