import type { Accommodations, AccommodationExemption } from "@examinus/domain/accommodations";

const exemptionLabels: Record<AccommodationExemption, string> = {
  fullscreen: "no full screen",
  one_screen: "second screen allowed",
  computers_only: "phones allowed",
};

// The short parts of what a student was given, for a chip: "1.5×", "+10 min", "+2 attempts", "no full screen".
export function accommodationParts(a: Accommodations | null | undefined): string[] {
  if (!a) return [];
  return [
    ...(a.timeMultiplier !== 1 ? [`${a.timeMultiplier}×`] : []),
    ...(a.extraMinutes > 0 ? [`+${a.extraMinutes} min`] : []),
    ...(a.extraAttempts > 0 ? [`+${a.extraAttempts} ${a.extraAttempts === 1 ? "attempt" : "attempts"}`] : []),
    ...a.exempt.map((e) => exemptionLabels[e]),
  ];
}
