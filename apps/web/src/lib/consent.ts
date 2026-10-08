// What a visitor allowed in the cookie banner, kept in a first-party cookie for a year. Necessary cookies (signing
// in, security) are always on. Examinus has no preference or analytics cookies yet: anything added later must check
// `allows(consent, "analytics")` (or `useConsent()` in components/cookie-consent.tsx) before it runs.

export const consentCookie = "examora_consent";
// Bump when the categories change, so everyone is asked again.
export const consentVersion = 1;

export const optionalCategories = ["preferences", "analytics"] as const;
export type OptionalCategory = (typeof optionalCategories)[number];

export type Consent = { version: number; given: string } & Record<OptionalCategory, boolean>;

export const categoryInfo: Record<"necessary" | OptionalCategory, { title: string; text: string }> = {
  necessary: {
    title: "Necessary",
    text: "Keep you signed in, protect your account, and remember this choice. Exam answers are saved in your browser while you take an exam, so a reload doesn't lose them. These can't be turned off.",
  },
  preferences: {
    title: "Preferences",
    text: "Remember settings like your last view or filters. Examinus doesn't use these yet; if it does, they'll only run with your OK.",
  },
  analytics: {
    title: "Analytics",
    text: "Count visits and see which pages are used, to make Examinus better. Examinus doesn't use these yet; if it does, they'll only run with your OK.",
  },
};

export function parseConsent(raw: string | undefined | null): Consent | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as Partial<Consent>;
    if (value.version !== consentVersion) return null;
    return {
      version: consentVersion,
      given: String(value.given ?? ""),
      preferences: value.preferences === true,
      analytics: value.analytics === true,
    };
  } catch {
    return null;
  }
}

export const allows = (consent: Consent | null, category: OptionalCategory) => consent?.[category] === true;
