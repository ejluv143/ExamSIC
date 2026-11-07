import type { CustomRole, InviteCode, OrgMember } from "@examinus/contract/organization";
import { parseMemberRoles } from "@examinus/domain/roles";
import type { Grants } from "@examinus/domain/user";
import type { OrganizationInviteItem, OrganizationRoleItem } from "../../database/schemas/index.ts";
import type { MemberRow } from "./Repo.ts";

export const toMember = (row: MemberRow): OrgMember => ({
  id: row.id,
  userId: row.userId,
  name: row.name,
  email: row.email,
  roles: parseMemberRoles(row.role),
  joinedAt: row.createdAt.toISOString(),
});

export const toInvite = (row: OrganizationInviteItem): InviteCode => ({
  id: row.id,
  code: row.code,
  roles: parseMemberRoles(row.role),
  expiresAt: row.expiresAt.toISOString(),
  uses: row.uses,
  createdAt: row.createdAt.toISOString(),
});

export const toRole = (row: OrganizationRoleItem): CustomRole => ({
  id: row.id,
  name: row.role,
  permissions: JSON.parse(row.permission) as Grants,
});
