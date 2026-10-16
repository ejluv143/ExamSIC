"use client";

import type { FormState } from "../actions";

export function FormMessage({ state }: { state: FormState }) {
  if (state && "error" in state) {
    return (
      <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state && "saved" in state) {
    return (
      <p role="status" className="rounded-lg bg-success-soft p-3 text-sm text-success">
        Saved.
      </p>
    );
  }
  return null;
}

// One checkbox per role, submitted as repeated `roles` fields.
export function RoleChecks({ options, checked = [] }: { options: readonly string[]; checked?: readonly string[] }) {
  return (
    <fieldset className="flex flex-wrap gap-x-4 gap-y-1.5">
      <legend className="sr-only">Roles</legend>
      {options.map((role) => (
        <label key={role} className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="roles" value={role} defaultChecked={checked.includes(role)} className="size-4 accent-primary" />
          {role}
        </label>
      ))}
    </fieldset>
  );
}
