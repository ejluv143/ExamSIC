import "server-only";
import type { Grants } from "@examinus/domain/user";
import { requirePermission } from "@/lib/auth/dal";
import { apiValue, read, write } from "@/lib/api/helpers";

// Whether this deployment lets organizations define their own roles (ORG_CUSTOM_ROLES).
export async function getAuthConfig() {
  return read((api) => api["auth.config"]());
}

export async function renameOrganization(name: string) {
  await requirePermission({ organization: ["update"] });
  return write((api) => api["org.update"]({ name }));
}

export async function getMembers() {
  await requirePermission({ organization: ["update"] });
  return apiValue((api) => api["org.members"]());
}

export async function addMember(email: string, roles: readonly string[]) {
  await requirePermission({ member: ["create"] });
  return write((api) => api["org.addMember"]({ email, roles }));
}

export async function setMemberRoles(memberId: string, roles: readonly string[]) {
  await requirePermission({ member: ["update"] });
  return write((api) => api["org.setMemberRoles"]({ memberId, roles }));
}

export async function removeMember(memberId: string) {
  await requirePermission({ member: ["delete"] });
  return write((api) => api["org.removeMember"]({ memberId }));
}

export async function getInvites() {
  await requirePermission({ organization: ["update"] });
  return apiValue((api) => api["org.invites"]());
}

export async function createInvite(roles: readonly string[], expiresInDays: number) {
  await requirePermission({ invitation: ["create"] });
  return write((api) => api["org.createInvite"]({ roles, expiresInDays }));
}

export async function revokeInvite(inviteId: string) {
  await requirePermission({ invitation: ["cancel"] });
  return write((api) => api["org.revokeInvite"]({ inviteId }));
}

// Custom roles; the page only asks when the deployment has them on.
export async function getRoles() {
  await requirePermission({ ac: ["read"] });
  return apiValue((api) => api["org.roles"]());
}

export async function createRole(name: string, permissions: Grants) {
  await requirePermission({ ac: ["create"] });
  return write((api) => api["org.createRole"]({ name, permissions }));
}

export async function updateRole(roleId: string, permissions: Grants) {
  await requirePermission({ ac: ["update"] });
  return write((api) => api["org.updateRole"]({ roleId, permissions }));
}

export async function deleteRole(roleId: string) {
  await requirePermission({ ac: ["delete"] });
  return write((api) => api["org.deleteRole"]({ roleId }));
}

// Owners only (the API checks); the session is left without an active organization.
export async function deleteOrganization() {
  await requirePermission({ organization: ["delete"] });
  return write((api) => api["org.delete"]());
}
