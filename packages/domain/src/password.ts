// What a new password needs, shown as a checklist on /register and checked again by the API.
export const passwordRules = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "An uppercase and a lowercase letter", test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: "A number", test: (p: string) => /\d/.test(p) },
] as const;

// The first rule a password misses, or null when it meets them all.
export const passwordProblem = (password: string) => passwordRules.find((r) => !r.test(password))?.label ?? null;

// 0–4 for the strength bar: the rules met, plus one for a symbol or 12+ characters once they're all met.
export function passwordStrength(password: string) {
  if (!password) return 0;
  const met = passwordRules.filter((r) => r.test(password)).length;
  const extra = met === passwordRules.length && (/[^A-Za-z0-9]/.test(password) || password.length >= 12) ? 1 : 0;
  return met + extra;
}
