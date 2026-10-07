// How many times a student may take a quiz or exam. Stored as attempts (retakes + 1); null is unlimited.

export const hasAttemptsLeft = (used: number, allowed: number | null) => allowed === null || used < allowed;

// "attempt 2 of 3", or just "attempt 2" when retakes are unlimited.
export const attemptLabel = (attempt: number, allowed: number | null) =>
  allowed === null ? `attempt ${attempt}` : `attempt ${attempt} of ${allowed}`;

export function retakesLabel(allowed: number | null): string {
  if (allowed === null) return "Unlimited retakes";
  const retakes = allowed - 1;
  return retakes === 0 ? "No retakes" : `${retakes} ${retakes === 1 ? "retake" : "retakes"}`;
}
