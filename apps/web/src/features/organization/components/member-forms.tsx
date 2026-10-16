"use client";

import { useActionState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { addMemberAction, removeMemberAction, setMemberRolesAction } from "../actions";
import { FormMessage, RoleChecks } from "./shared";

export function AddMemberForm({ roleOptions }: { roleOptions: readonly string[] }) {
  const [state, action, pending] = useActionState(addMemberAction, undefined);
  return (
    <form action={action} className="max-w-md space-y-3 p-5">
      <Field label="Email" hint="The person needs an account already.">
        <input type="email" name="email" required autoComplete="off" className={inputClass} />
      </Field>
      <RoleChecks options={roleOptions} checked={["teacher"]} />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add member"}
      </Button>
    </form>
  );
}

export function MemberRolesForm({
  memberId,
  roles,
  roleOptions,
}: {
  memberId: string;
  roles: readonly string[];
  roleOptions: readonly string[];
}) {
  const [state, action, pending] = useActionState(setMemberRolesAction.bind(null, memberId), undefined);
  return (
    <form action={action} className="space-y-2">
      <RoleChecks options={roleOptions} checked={roles} />
      <div className="flex items-center gap-2">
        <Button type="submit" variant="secondary" className="px-2 py-1" disabled={pending}>
          {pending ? "Saving…" : "Save roles"}
        </Button>
        {state && "saved" in state && <span className="text-xs text-success">Saved</span>}
      </div>
      {state && "error" in state && <FormMessage state={state} />}
    </form>
  );
}

export function RemoveMemberButton({ memberId, name }: { memberId: string; name: string }) {
  const [state, action, pending] = useActionState(removeMemberAction.bind(null, memberId), undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Remove ${name} from the organization?`)) e.preventDefault();
      }}
    >
      <Button type="submit" variant="danger" className="px-2 py-1" disabled={pending}>
        Remove
      </Button>
      {state && "error" in state && <FormMessage state={state} />}
    </form>
  );
}
