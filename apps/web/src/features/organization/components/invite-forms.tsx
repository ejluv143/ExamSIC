"use client";

import { useActionState } from "react";
import { Button, Field, inputBase } from "@/components/ui";
import { createInviteAction, revokeInviteAction } from "../actions";
import { FormMessage, RoleChecks } from "./shared";

export function NewInviteForm({ roleOptions }: { roleOptions: readonly string[] }) {
  const [state, action, pending] = useActionState(createInviteAction, undefined);
  return (
    <form action={action} className="max-w-md space-y-3 p-5">
      <RoleChecks options={roleOptions} checked={["teacher"]} />
      <Field label="Expires in (days)">
        <input
          type="number"
          name="expiresInDays"
          required
          min={1}
          max={90}
          step={1}
          defaultValue={7}
          className={`${inputBase} w-28`}
        />
      </Field>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "New invite code"}
      </Button>
    </form>
  );
}

export function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const [state, action, pending] = useActionState(revokeInviteAction.bind(null, inviteId), undefined);
  return (
    <form action={action}>
      <Button type="submit" variant="danger" className="px-2 py-1" disabled={pending}>
        Revoke
      </Button>
      {state && "error" in state && <FormMessage state={state} />}
    </form>
  );
}
