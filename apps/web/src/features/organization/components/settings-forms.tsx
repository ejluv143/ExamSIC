"use client";

import { useActionState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { deleteOrganizationAction, renameOrganizationAction } from "../actions";
import { FormMessage } from "./shared";

export function RenameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(renameOrganizationAction, undefined);
  return (
    <form action={action} className="max-w-md space-y-3">
      <Field label="Organization name">
        <input name="name" required minLength={2} maxLength={80} defaultValue={name} className={inputClass} />
      </Field>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

// Deleting needs a typed confirmation; the action redirects away on success.
export function DeleteOrganizationForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(deleteOrganizationAction, undefined);
  return (
    <form
      action={action}
      className="max-w-md space-y-3"
      onSubmit={(e) => {
        if (!confirm(`Delete ${name} and everything in it? This can't be undone.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="confirm" value="delete" />
      <FormMessage state={state} />
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? "Deleting…" : "Delete organization"}
      </Button>
    </form>
  );
}
