"use client";

import { startTransition, useActionState, useState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import type { Role } from "@/lib/auth/roles";
import type { FormState } from "./actions";

export type AccountFormValues = { name: string; email: string; role: Role; department: string; studentId: string };

export function FormMessage({ state }: { state: FormState }) {
  if (!state) return null;
  return "error" in state ? (
    <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
      {state.error}
    </p>
  ) : (
    <p role="status" className="rounded-lg bg-success-soft p-3 text-sm text-success">
      {state.saved}
    </p>
  );
}

// Create (with email and password) or edit (name, role and profile) an account.
export function AccountForm({
  action,
  initial,
  roster,
  mode,
  roleLocked = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial: AccountFormValues;
  roster: { id: string; label: string }[];
  mode: "create" | "edit";
  roleLocked?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [role, setRole] = useState<Role>(initial.role);

  return (
    <form
      // Submitted by hand rather than through `action`, so React doesn't clear the fields when a save fails.
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className="space-y-4"
      noValidate
    >
      <Field label="Full name">
        <input name="name" defaultValue={initial.name} required maxLength={100} className={inputClass} />
      </Field>
      {mode === "create" ? (
        <>
          <Field label="Email">
            <input name="email" type="email" defaultValue={initial.email} required className={inputClass} />
          </Field>
          <Field label="Password" hint="At least 8 characters. Share it with the user privately.">
            <input name="password" type="password" autoComplete="new-password" required minLength={8} className={inputClass} />
          </Field>
        </>
      ) : (
        <Field label="Email">
          <input value={initial.email} disabled className={`${inputClass} text-muted`} />
        </Field>
      )}
      <Field label="Role" hint={roleLocked ? "You can't change your own role." : undefined}>
        <select
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          disabled={roleLocked}
          className={inputClass}
        >
          <option value="teacher">Teacher</option>
          <option value="student">Student</option>
          <option value="admin">Admin</option>
        </select>
      </Field>
      {/* A disabled select isn't submitted; the locked role still has to reach the action. */}
      {roleLocked && <input type="hidden" name="role" value={role} />}
      {role === "teacher" && (
        <Field label="Department">
          <input
            name="department"
            defaultValue={initial.department || "School of Information Technology"}
            required
            className={inputClass}
          />
        </Field>
      )}
      {role === "student" && (
        <Field label="Roster entry" hint="The class-roster student this account signs in as.">
          <select name="studentId" defaultValue={initial.studentId} required className={inputClass}>
            <option value="" disabled>
              Choose a student…
            </option>
            {roster.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : mode === "create" ? "Create account" : "Save changes"}
      </Button>
    </form>
  );
}
