// Which client a request comes from (the browser, or the desktop app) and the semantic versions the API, the desktop
// app and the releases are numbered with. The desktop app announces itself in its user agent; the API reads it from
// the headers the web app forwards, and refuses a desktop build older than the version it requires.

export const clientKinds = ["web", "desktop"] as const;
export type ClientKind = (typeof clientKinds)[number];

export type Client = { kind: "web" } | { kind: "desktop"; version: string };

// The token the desktop app appends to its user agent: `ExaminusDesktop/1.4.0`.
export const desktopUserAgentToken = "ExaminusDesktop";
const desktopPattern = new RegExp(`\\b${desktopUserAgentToken}/(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?)`);

// What the user agent says this is. Anything that isn't the desktop app is the web.
export function clientOf(userAgent: string | undefined): Client {
  const match = userAgent ? desktopPattern.exec(userAgent) : null;
  return match ? { kind: "desktop", version: match[1]! } : { kind: "web" };
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
