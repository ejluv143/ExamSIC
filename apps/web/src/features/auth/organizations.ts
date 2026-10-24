"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { homeFor, roleOf } from "@examinus/domain/roles";
import { write } from "@/lib/api/helpers";

export type OrganizationFormState = { error: string } | undefined;

// The active organization lives on the session in the database, so every layout shows the new one afterwards.
async function enter(user: Parameters<typeof roleOf>[0]): Promise<never> {
  revalidatePath("/", "layout");
  redirect(homeFor(roleOf(user)));
}

// What the picker's cards and the sidebar switcher call.
export async function setActiveOrganizationAction(organizationId: string | null): Promise<OrganizationFormState> {
  // The API checks membership; null is the personal space.
  const result = await write((api) => api["org.setActive"]({ organizationId }));
  if ("error" in result) return { error: result.error };
  return enter(result.ok);
}

export async function createOrganizationAction(_prev: OrganizationFormState, formData: FormData): Promise<OrganizationFormState> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 80) return { error: "Use a name of 2 to 80 characters." };
  const result = await write((api) => api["org.create"]({ name }));
  if ("error" in result) return { error: result.error };
  return enter(result.ok);
}

export async function joinWithCodeAction(_prev: OrganizationFormState, formData: FormData): Promise<OrganizationFormState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter the invite code." };
  const result = await write((api) => api["org.joinWithCode"]({ code }));
  if ("error" in result) return { error: result.error };
  return enter(result.ok);
}

// A class code also brings a student into the class's organization.
export async function joinClassWithCodeAction(_prev: OrganizationFormState, formData: FormData): Promise<OrganizationFormState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter the class code from your teacher." };
  const sex = formData.get("sex");
  const studentNumber = String(formData.get("studentNumber") ?? "").trim();
  if (studentNumber.length > 40) return { error: "That student number is too long." };
  const result = await write((api) =>
    api["enrollment.join"]({ code, sex: sex === "M" || sex === "F" ? sex : null, studentNumber: studentNumber || null }),
  );
  if ("error" in result) return { error: result.error };
  revalidatePath("/", "layout");
  redirect("/student");
}
