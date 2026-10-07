"use client";

import { useActionState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { removeAccount, setAccountPassword, setAccountSuspended } from "../../actions";
import { FormMessage } from "../../account-form";

export function PasswordForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(setAccountPassword.bind(null, userId), undefined);
  return (
    <form action={action} className="space-y-3" noValidate>
      <Field label="New password" hint="At least 8 characters.">
        <input name="password" type="password" autoComplete="new-password" required minLength={8} className={inputClass} />
      </Field>
      <FormMessage state={state} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Set password"}
      </Button>
    </form>
  );
}

export function SuspendForm({ userId, suspended }: { userId: string; suspended: boolean }) {
  const [state, action, pending] = useActionState(setAccountSuspended.bind(null, userId, !suspended), undefined);
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-muted">
        {suspended
          ? "This account can't sign in. Reinstating lets the user sign in again."
          : "Suspending signs the user out everywhere and blocks sign-in until reinstated."}
      </p>
      <FormMessage state={state} />
      <Button type="submit" variant={suspended ? "secondary" : "danger"} disabled={pending}>
        {suspended ? "Reinstate account" : "Suspend account"}
      </Button>
    </form>
  );
}

export function RemoveForm({ userId, name }: { userId: string; name: string }) {
  const [state, action, pending] = useActionState(removeAccount.bind(null, userId), undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Remove ${name}'s account? This can't be undone.`)) e.preventDefault();
      }}
      className="space-y-3"
    >
      <p className="text-sm text-muted">Deletes the account and its sessions. Class and exam records stay.</p>
      <FormMessage state={state} />
      <Button type="submit" variant="danger" disabled={pending}>
        Remove account
      </Button>
    </form>
  );
}
