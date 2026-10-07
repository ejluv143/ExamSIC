// Kept free of other imports: the API's Drizzle schema imports this file.
export const roleNames = ["admin", "teacher", "student"] as const;

export type Role = (typeof roleNames)[number];

export const isRole = (value: unknown): value is Role => roleNames.includes(value as Role);

export const homeFor = (role: Role) => `/${role}` as const;
