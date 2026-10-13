// Kept free of other imports: the API's Drizzle schema imports this file.
// A guest is an anonymous account made on /join with only a display name; it can only play the games whose
// teacher allowed guests.
export const roleNames = ["admin", "teacher", "student", "guest"] as const;

export type Role = (typeof roleNames)[number];

export const isRole = (value: unknown): value is Role => roleNames.includes(value as Role);

export const homeFor = (role: Role) => (role === "guest" ? "/join" : (`/${role}` as const));

// A teacher's plan. An expired plan counts as "free".
export const planNames = ["free", "pro", "ai"] as const;

export type Plan = (typeof planNames)[number];

export const isPlan = (value: unknown): value is Plan => planNames.includes(value as Plan);

// The subject type of a class decides which question types its exams offer (apps/web/src/lib/subjects.ts).
export const subjectAreaNames = ["general", "english", "math", "science", "programming"] as const;

export type SubjectArea = (typeof subjectAreaNames)[number];

// As on the school's grade sheet, which lists male and female students separately.
export const sexNames = ["M", "F"] as const;

export type Sex = (typeof sexNames)[number];
