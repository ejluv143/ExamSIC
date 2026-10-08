// Kept free of other imports: the API's Drizzle schema imports this file.
export const roleNames = ["admin", "teacher", "student"] as const;

export type Role = (typeof roleNames)[number];

export const isRole = (value: unknown): value is Role => roleNames.includes(value as Role);

export const homeFor = (role: Role) => `/${role}` as const;

// A teacher's plan. An expired plan counts as "free".
export const planNames = ["free", "pro"] as const;

export type Plan = (typeof planNames)[number];

export const isPlan = (value: unknown): value is Plan => planNames.includes(value as Plan);

// The subject type of a class decides which question types its exams offer (apps/web/src/lib/subjects.ts).
export const subjectAreaNames = ["general", "english", "math", "science", "programming"] as const;

export type SubjectArea = (typeof subjectAreaNames)[number];

// As on the school's grade sheet, which lists male and female students separately.
export const sexNames = ["M", "F"] as const;

export type Sex = (typeof sexNames)[number];
