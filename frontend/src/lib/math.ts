// Math in question text is LaTeX between $…$ (inline) or $$…$$ (on its own line). \$ is a dollar sign.

export type MathSegment = { text: string } | { tex: string; display: boolean };

export function mathSegments(input: string): MathSegment[] {
  const out: MathSegment[] = [];
  let text = "";
  let i = 0;
  while (i < input.length) {
    if (input.startsWith("\\$", i)) {
      text += "$";
      i += 2;
      continue;
    }
    if (input[i] === "$") {
      const display = input[i + 1] === "$";
      const open = display ? 2 : 1;
      const end = input.indexOf(display ? "$$" : "$", i + open);
      if (end > i + open) {
        if (text) out.push({ text });
        text = "";
        out.push({ tex: input.slice(i + open, end), display });
        i = end + open;
        continue;
      }
    }
    text += input[i++];
  }
  if (text) out.push({ text });
  return out;
}

export const hasMath = (s: string) => mathSegments(s).some((x) => "tex" in x);

// Reads what a student typed as a number: 12, -3.5, 1,250, 3/4, 1 1/2, 25%.
export function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(/,/g, "").replace(/\s+/g, " ");
  if (!s) return null;
  if (/^-?\d*\.?\d+%$/.test(s)) return Number(s.slice(0, -1)) / 100;
  const mixed = s.match(/^(-?)(\d+) (\d+)\/(\d+)$/);
  if (mixed) {
    const value = Number(mixed[2]) + Number(mixed[3]) / Number(mixed[4]);
    return Number(mixed[4]) === 0 ? null : mixed[1] ? -value : value;
  }
  const fraction = s.match(/^(-?\d*\.?\d+)\/(-?\d*\.?\d+)$/);
  if (fraction) return Number(fraction[2]) === 0 ? null : Number(fraction[1]) / Number(fraction[2]);
  const n = Number(s);
  return /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(s) && Number.isFinite(n) ? n : null;
}
