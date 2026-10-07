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
