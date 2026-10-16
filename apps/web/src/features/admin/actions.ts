"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Result, Schema } from "effect";
import { callApi, forwardedHeaders } from "@/lib/api/client";
import { emailPattern, parseForm } from "@/lib/validate";

export type FormState = { error: string } | { saved: string } | undefined;

// Form fields with messages for people; the API validates the same rules again and enforces permissions.
// The role is the platform role (admin or user); organization roles are managed in the organization.
const required =
  (message: string) =>
  <S extends Schema.Top>(self: S) =>
    self.pipe(Schema.annotateKey({ messageMissingKey: message }));
const name = Schema.Trim.check(
  Schema.isMinLength(1, { message: "Enter a name." }),
  Schema.isMaxLength(100, { message: "Use a name of at most 100 characters." }),
).pipe(required("Enter a name."));
const passwordText = Schema.String.check(
  Schema.isMinLength(8, { message: "Use a password of at least 8 characters." }),
  Schema.isMaxLength(128, { message: "Use a password of at most 128 characters." }),
);
const password = passwordText.pipe(required("Enter a password."));
const email = Schema.Trim.check(Schema.isPattern(emailPattern, { message: "Enter a valid email address." })).pipe(
  required("Enter an email address."),
);

const withProfile = <F extends Schema.Struct.Fields>(fields: F) =>
  Schema.Struct({
    ...fields,
    role: Schema.Literals(["admin", "user"])
      .annotate({ message: "Choose a role." })
      .pipe(required("Choose a role.")),
    department: Schema.optional(Schema.String),
  });
const createFields = withProfile({ name, email, password });
const updateFields = withProfile({ name });

// Admins have no department; for a user it is optional.
const profileOf = (fields: typeof createFields.Type | typeof updateFields.Type) => ({
  role: fields.role,
  department: fields.role === "user" ? fields.department?.trim() || null : null,
});

// The API's declared errors, as form messages. A lost session goes back to sign-in.
function failure(error: { _tag: "Unauthorized" } | { _tag: string; message: string }): FormState {
  if (error._tag === "Unauthorized") redirect("/login");
  return { error: "message" in error ? error.message : "Something went wrong." };
}

async function call<A, E extends { _tag: "Unauthorized" } | { _tag: string; message: string }>(
  run: Parameters<typeof callApi<A, E>>[0],
): Promise<FormState | null> {
  const result = await callApi(run, forwardedHeaders(await headers()));
  return Result.isFailure(result) ? failure(result.failure) : null;
}

export async function createAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(createFields, Object.fromEntries(formData));
  if (Result.isFailure(parsed)) return { error: parsed.failure };
  const { name: n, email: e, password: p } = parsed.success;

  const failed = await call((api) => api["admin.createUser"]({ name: n, email: e, password: p, profile: profileOf(parsed.success) }));
  if (failed) return failed;
  revalidatePath("/admin");
  redirect("/admin");
}

export async function updateAccount(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(updateFields, Object.fromEntries(formData));
  if (Result.isFailure(parsed)) return { error: parsed.failure };

  const failed = await call((api) =>
    api["admin.updateUser"]({ userId, name: parsed.success.name, profile: profileOf(parsed.success) }),
  );
  if (failed) return failed;
  revalidatePath("/admin");
  return { saved: "Saved." };
}

export async function setAccountPassword(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(passwordText, formData.get("password") ?? "");
  if (Result.isFailure(parsed)) return { error: parsed.failure };
  return (await call((api) => api["admin.setPassword"]({ userId, password: parsed.success }))) ?? { saved: "Password changed." };
}

// Suspending signs the user out everywhere and blocks sign-in until reinstated.
export async function setAccountSuspended(userId: string, suspended: boolean): Promise<FormState> {
  const failed = await call((api) => api["admin.setSuspended"]({ userId, suspended }));
  if (failed) return failed;
  revalidatePath("/admin");
  return { saved: suspended ? "Account suspended." : "Account reinstated." };
}

export async function removeAccount(userId: string): Promise<FormState> {
  const failed = await call((api) => api["admin.removeUser"]({ userId }));
  if (failed) return failed;
  revalidatePath("/admin");
  redirect("/admin");
}
