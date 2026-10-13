// Seeded randomness: the same seed always gives the same numbers, so a shuffled paper survives a reload and the
// teacher sees exactly what a student saw.

// A small, fast, deterministic generator returning numbers in [0, 1).
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hashString = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h;
};

// A generator seeded by an id alone, for what must be shuffled even when the quiz doesn't shuffle choices.
export const idRandom = (id: string): (() => number) => mulberry32(hashString(id) >>> 0);

// Fisher-Yates on a copy.
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// Shuffled, but never left in the order it came in (a rotation by one when the shuffle lands on it).
export function shuffledNotSorted<T>(items: readonly T[], random: () => number): T[] {
  const out = shuffled(items, random);
  if (out.length > 1 && out.every((x, i) => x === items[i])) out.push(out.shift()!);
  return out;
}
