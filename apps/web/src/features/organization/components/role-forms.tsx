"use client";

import { useActionState } from "react";
import { Button, Field, inputBase } from "@/components/ui";
import type { Grants } from "@examinus/domain/user";
import { createRoleAction, deleteRoleAction, updateRoleAction } from "../actions";
import { FormMessage } from "./shared";

type Statements = Readonly<Record<string, readonly string[]>>;

// One checkbox per resource/action; submitted as repeated `permission` fields ("resource:action").
function Matrix({ statements, granted }: { statements: Statements; granted: Grants }) {
  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {Object.entries(statements).map(([resource, actions]) => (
        <div key={resource} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
          <span className="w-32 shrink-0 text-sm font-medium">{resource}</span>
          {actions.map((a) => (
            <label key={a} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name="permission"
                value={`${resource}:${a}`}
                defaultChecked={granted[resource]?.includes(a) ?? false}
                className="size-4 accent-primary"
              />
              {a}
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

export function NewRoleForm({ statements }: { statements: Statements }) {
  const [state, action, pending] = useActionState(createRoleAction, undefined);
  return (
    <form action={action} className="space-y-3 p-5">
      <Field label="Role name" hint="Lowercase letters, digits and dashes, e.g. lab-assistant.">
        <input name="name" required pattern="[a-z][a-z0-9\-]{1,30}" autoComplete="off" className={`${inputBase} w-64`} />
      </Field>
      <Matrix statements={statements} granted={{}} />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create role"}
      </Button>
    </form>
  );
}

export function RoleEditor({
  roleId,
  name,
  statements,
  granted,
}: {
  roleId: string;
  name: string;
  statements: Statements;
  granted: Grants;
}) {
  const [state, action, pending] = useActionState(updateRoleAction.bind(null, roleId), undefined);
  const [removed, remove, removing] = useActionState(deleteRoleAction.bind(null, roleId), undefined);
  return (
    <div className="space-y-3 p-5">
      <h3 className="font-mono text-sm font-semibold">{name}</h3>
      <form action={action} className="space-y-3">
        <Matrix statements={statements} granted={granted} />
        <FormMessage state={state} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save permissions"}
        </Button>
      </form>
      <form
        action={remove}
        onSubmit={(e) => {
          if (!confirm(`Delete the role ${name}? Members holding it lose it.`)) e.preventDefault();
        }}
      >
        <Button type="submit" variant="danger" className="px-2 py-1" disabled={removing}>
          Delete role
        </Button>
        {removed && "error" in removed && <FormMessage state={removed} />}
      </form>
    </div>
  );
}
