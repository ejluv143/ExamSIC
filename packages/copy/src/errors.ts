// Which screen a refused attempt gets. The wording of each refusal is written by the API and passed through as the
// error's message; only the mapping from error tag to screen lives here.
export type RefusalScreen = "waiting" | "computers_only" | "blocked";

export const refusalScreens = {
  DeviceApprovalRequired: "waiting",
  ComputersOnly: "computers_only",
  DeviceAttestationRequired: "blocked",
  Forbidden: "blocked",
  OpenElsewhere: "blocked",
  ClientOutdated: "blocked",
} as const satisfies Record<string, RefusalScreen>;

// The screen for an error tag, or null when the refusal isn't one the take screen explains (the attempt is over).
export const refusalScreen = (tag: string): RefusalScreen | null =>
  Object.hasOwn(refusalScreens, tag) ? refusalScreens[tag as keyof typeof refusalScreens] : null;

// The card for a phone or tablet on a computers-only exam; the API's message goes before `hint`.
export const takeOnComputer = {
  title: "Use a computer",
  hint: "Open this page on a laptop or desktop computer to take the exam.",
} as const;

// The card for any other refusal; the API's message goes below the title.
export const takeBlocked = { title: "You can't take this here" } as const;
