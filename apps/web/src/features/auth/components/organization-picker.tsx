"use client";

import { useActionState, useState, useTransition } from "react";
import { Building2, User } from "lucide-react";
import type { Membership } from "@examinus/domain/user";
import { Button, Card, inputBase } from "@/components/ui";
import { Select } from "@/components/select";
import { RoleBadge } from "@/features/admin/components/role-badge";
import {
  createOrganizationAction,
  joinClassWithCodeAction,
  joinWithCodeAction,
  setActiveOrganizationAction,
} from "../organizations";

function FormError({ state }: { state: { error: string } | undefined }) {
  return state ? (
    <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
      {state.error}
    </p>
  ) : null;
}

function MembershipCards({ memberships, activeId }: { memberships: readonly Membership[]; activeId: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await setActiveOrganizationAction(null);
            if (result) setError(result.error);
          })
        }
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <User className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">Personal space</span>
          <span className="block text-xs text-muted">Your own classes and assessments, outside any organization</span>
        </span>
        {activeId === null && <span className="text-xs font-medium text-primary">Active</span>}
      </button>
      {memberships.map((m) => (
        <button
          key={m.id}
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await setActiveOrganizationAction(m.id);
              if (result) setError(result.error);
            })
          }
          className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            <Building2 className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{m.name}</span>
            <span className="mt-1 flex flex-wrap gap-1">
              {m.roles.map((r) => (
                <RoleBadge key={r} role={r} />
              ))}
            </span>
          </span>
          {m.id === activeId && <span className="text-xs font-medium text-primary">Active</span>}
        </button>
      ))}
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function CreateForm() {
  const [state, action, pending] = useActionState(createOrganizationAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Organization name</span>
        <input name="name" required minLength={2} maxLength={80} autoComplete="off" placeholder="e.g. Riverside College" className={`${inputBase} w-full`} />
      </label>
      <FormError state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create organization"}
      </Button>
    </form>
  );
}

function InviteForm() {
  const [state, action, pending] = useActionState(joinWithCodeAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Invite code</span>
        <input
          name="code"
          required
          autoComplete="off"
          autoCapitalize="characters"
          className={`${inputBase} w-full font-mono tracking-widest uppercase`}
        />
      </label>
      <FormError state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Joining…" : "Join organization"}
      </Button>
    </form>
  );
}

function ClassForm() {
  const [state, action, pending] = useActionState(joinClassWithCodeAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Class code</span>
        <input
          name="code"
          required
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="e.g. DBMS3AX"
          className={`${inputBase} w-full font-mono tracking-widest uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case`}
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Student number</span>
        <input name="studentNumber" maxLength={40} autoComplete="off" placeholder="e.g. 2023-10537" className={`${inputBase} w-full`} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Sex</span>
        <Select
          name="sex"
          defaultValue=""
          placeholder="Choose"
          options={[
            { value: "F", label: "Female" },
            { value: "M", label: "Male" },
          ]}
        />
      </label>
      <p className="text-xs text-muted">
        Your student number and sex are asked the first time you join, for your teachers&apos; grade sheets.
      </p>
      <FormError state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Joining…" : "Join class"}
      </Button>
    </form>
  );
}

// Every way into an organization: pick one of yours, make one, or join with an invite code or a class code.
export function OrganizationPicker({
  memberships,
  activeId,
}: {
  memberships: readonly Membership[];
  activeId: string | null;
}) {
  return (
    <div className="w-full max-w-xl space-y-6">
      <section aria-labelledby="your-organizations" className="space-y-2">
        <h2 id="your-organizations" className="font-semibold">
          Your organizations
        </h2>
        <MembershipCards memberships={memberships} activeId={activeId} />
      </section>
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">Create an organization</h2>
        <CreateForm />
      </Card>
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">Join with an invite code</h2>
        <InviteForm />
      </Card>
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">Join a class with a class code</h2>
        <ClassForm />
      </Card>
    </div>
  );
}
