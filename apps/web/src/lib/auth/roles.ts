// Shared by the proxy, server actions and the data layer; no server-only imports.
export const roleNames = ["admin", "teacher", "student"] as const;

export type Role = (typeof roleNames)[number];

export const isRole = (value: unknown): value is Role => roleNames.includes(value as Role);

export type User =
  | { id: string; role: "admin"; name: string; email: string }
  | { id: string; role: "teacher"; name: string; email: string; department: string }
  | { id: string; role: "student"; name: string; email: string; studentId: string };

export const homeFor = (role: Role) => `/${role}` as const;
