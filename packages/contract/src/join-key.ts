// The key students type to join a session or game lobby: seven characters from an alphabet without look-alikes
// (no 0/O, 1/I/L).
export const joinKeyAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const joinKeyLength = 7;

export function newJoinKey(): string {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(joinKeyLength)),
    // Rejection-free: the alphabet has 31 characters, so the small bias of `% 31` on a byte is acceptable for a key
    // that is also checked for collisions.
    (b) => joinKeyAlphabet[b % joinKeyAlphabet.length],
  ).join("");
}

// What a student typed as the canonical key: case-insensitive, spaces and dashes ignored. null when it isn't a
// seven-character key.
export function normalizeJoinKey(raw: string): string | null {
  const key = raw.replace(/[\s-]/g, "").toUpperCase();
  if (key.length !== joinKeyLength) return null;
  for (const ch of key) if (!joinKeyAlphabet.includes(ch)) return null;
  return key;
}

// A key as shown to people: ABC-DEFG.
export function formatJoinKey(key: string): string {
  return `${key.slice(0, 3)}-${key.slice(3)}`;
}
