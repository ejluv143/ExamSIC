"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Result, Schema } from "effect";
import type { Grants } from "@examinus/domain/user";
import {
  addMember,
  createInvite,
  createRole,
  deleteOrganization,
  deleteRole,
  removeMember,
  renameOrganization,
  revokeInvite,
  setMemberRoles,
  updateRole,
} from "@/features/organization/data";
import { emailPattern, parseForm } from "@/lib/validate";
import type { Outcome } from "@/lib/api/helpers";

export type FormState = { error: string } | { saved: true } | undefined;

const path = "/teacher/organization";
const badRequest = "Check the form and try again.";

const Name = Schema.Trim.check(Schema.isMinLength(2, { message: "Use a name of 2 to 80 characters." }), Schema.isMaxLength(80, { message: "Use a name of 2 to 80 characters." }));
const Roles = Schema.Array(Schema.NonEmptyString).check(Schema.isMinLength(1, { message: "Pick at least one role." }));
const Email = Schema.Trim.check(Schema.isPattern(emailPattern, { message: "Enter a valid email address." }));
const RoleName = Schema.String.check(
  Schema.isPattern(/^[a-z][a-z0-9-]{1,30}$/, {
    message: "Use 2 to 31 lowercase letters, digits or dashes, starting with a letter.",
  }),
);
const Days = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt({ message: "Use whole days." }), Schema.isBetween({ minimum: 1, maximum: 90 }, { message: "Use 1 to 90 days." })),
);

const done = (outcome: Outcome<unknown>): FormState => {
  if ("error" in outcome) return { error: outcome.error };
  revalidatePath(path, "layout");
  return { saved: true };
};

// "resource:action" checkboxes back into grants.
function grantsOf(formData: FormData): Grants {
  const grants: Record<string, string[]> = {};
  for (const value of formData.getAll("permission")) {
    if (typeof value !== "string") continue;
    const [resource, action] = value.split(":");
    if (resource && action) (grants[resource] ??= []).push(action);
  }
  return grants;
}

const rolesOf = (formData: FormData) => formData.getAll("roles").filter((r): r is string => typeof r === "string");

export async function renameOrganizationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = parseForm(Name, formData.get("name"));
  if (Result.isFailure(name)) return { error: name.failure };
  return done(await renameOrganization(name.success));
}

export async function addMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = parseForm(Email, formData.get("email"));
  if (Result.isFailure(email)) return { error: email.failure };
  const roles = parseForm(Roles, rolesOf(formData));
  if (Result.isFailure(roles)) return { error: roles.failure };
  return done(await addMember(email.success, roles.success));
}

export async function setMemberRolesAction(memberId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const roles = parseForm(Roles, rolesOf(formData));
  if (Result.isFailure(roles)) return { error: roles.failure };
  return done(await setMemberRoles(memberId, roles.success));
}

export async function removeMemberAction(memberId: string): Promise<FormState> {
  return done(await removeMember(memberId));
}

export async function createInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const roles = parseForm(Roles, rolesOf(formData));
  if (Result.isFailure(roles)) return { error: roles.failure };
  const days = parseForm(Days, formData.get("expiresInDays"));
  if (Result.isFailure(days)) return { error: days.failure };
  return done(await createInvite(roles.success, days.success));
}

export async function revokeInviteAction(inviteId: string): Promise<FormState> {
  return done(await revokeInvite(inviteId));
}

export async function createRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = parseForm(RoleName, formData.get("name"));
  if (Result.isFailure(name)) return { error: name.failure };
  return done(await createRole(name.success, grantsOf(formData)));
}

export async function updateRoleAction(roleId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return done(await updateRole(roleId, grantsOf(formData)));
}

export async function deleteRoleAction(roleId: string): Promise<FormState> {
  return done(await deleteRole(roleId));
}

// Leaves the session without an active organization: back to the organization picker.
export async function deleteOrganizationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (formData.get("confirm") !== "delete") return { error: badRequest };
  const result = await deleteOrganization();
  if ("error" in result) return { error: result.error };
  revalidatePath("/", "layout");
  redirect("/organizations");
}
