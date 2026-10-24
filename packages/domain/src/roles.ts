// Kept free of other imports: the API's Drizzle schema imports this file.
//
// Two kinds of role. The platform role is the account's (`users.role`): `admin` runs the platform, `user` is
// everyone with a real account, and `guest` is an anonymous account made on /join with only a display name; it can
// only take the games, quizzes and exams whose teacher allowed guests. Teaching and learning roles are organization
// memberships: the same account can be a teacher in one organization and a student in another, and a member can
// hold several roles in one organization (`members.role` is comma-separated, e.g. "admin,teacher").
export const platformRoleNames = ["admin", "user", "guest"] as const;

export type PlatformRole = (typeof platformRoleNames)[number];

export const isPlatformRole = (value: unknown): value is PlatformRole => platformRoleNames.includes(value as PlatformRole);

// The roles a member can hold in an organization, from most to least powerful. `owner` also deletes the organization
// and hands it over; `admin` manages members, invite codes, AI keys and settings; `teacher` and `student` are the
// teaching and learning roles. An organization may define more roles of its own (see permissions.ts).
export const orgRoleNames = ["owner", "admin", "teacher", "student"] as const;

export type OrgRole = (typeof orgRoleNames)[number];

export const isOrgRole = (value: unknown): value is OrgRole => orgRoleNames.includes(value as OrgRole);

// Better Auth stores a member's roles comma-separated.
export const parseMemberRoles = (stored: string) => stored.split(",").map((r) => r.trim()).filter(Boolean);
export const joinMemberRoles = (roles: readonly string[]) => [...new Set(roles)].join(",");

// What a signed-in person is doing right now, worked out from their platform role and their roles in the active
// organization: it picks their area of the app (/admin, /teacher, /student, /join). Owners and admins of an
// organization use the teacher area, which is where the organization's settings live.
export const roleNames = ["admin", "teacher", "student", "guest"] as const;

export type Role = (typeof roleNames)[number];

export const isRole = (value: unknown): value is Role => roleNames.includes(value as Role);
export const roleOf = (user: {
  readonly role: PlatformRole;
  readonly organization: { readonly roles: readonly string[] } | null;
}): Role | null => {
  if (user.role === "admin") return "admin";
  if (user.role === "guest") return "guest";
  if (!user.organization) return null;
  const roles = user.organization.roles;
  if (roles.some((r) => r === "owner" || r === "admin" || r === "teacher")) return "teacher";
  if (roles.includes("student")) return "student";
  // A member with only custom roles: the teacher area, where their permissions decide what they see.
  return roles.length > 0 ? "teacher" : null;
};

// Without a role there is no active organization: the picker is where to get one.
export const homeFor = (role: Role | null) => (role === null ? "/organizations" : role === "guest" ? "/join" : (`/${role}` as const));

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
