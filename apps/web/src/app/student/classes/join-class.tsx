"use client";

import { useActionState } from "react";
import { LogOut } from "lucide-react";
import { Button, inputBase } from "@/components/ui";
import { joinClassAction, type leaveClassAction } from "./actions";

// The code from the teacher; the first time, also their student number and sex for the teacher's grade sheet.
export function JoinClassForm({ firstJoin }: { firstJoin: boolean }) {
  const [state, action, pending] = useActionState(joinClassAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Class code</span>
          <input
            name="code"
            required
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="e.g. DBMS3AX"
            className={`${inputBase} w-44 font-mono tracking-widest uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case`}
          />
        </label>
        {firstJoin && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Student number</span>
            <input
              name="studentNumber"
              required
              maxLength={40}
              autoComplete="off"
              placeholder="e.g. 2023-10537"
              className={`${inputBase} w-44`}
            />
          </label>
        )}
        {firstJoin && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Sex</span>
            <select name="sex" required defaultValue="" className={`${inputBase} w-36`}>
              <option value="" disabled>
                Choose
              </option>
              <option value="F">Female</option>
              <option value="M">Male</option>
            </select>
          </label>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Joining…" : "Join class"}
        </Button>
      </div>
      {firstJoin && (
        <p className="text-xs text-muted">
          Your student number (as on your school ID) and sex are asked once, for your teachers&apos; grade sheets.
        </p>
      )}
      {state && "error" in state && (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state && "joined" in state && (
        <p role="status" className="rounded-lg bg-success-soft p-3 text-sm text-success">
          You&apos;ve joined the class.
        </p>
      )}
    </form>
  );
}

export function LeaveClassButton({ title, leave }: { title: string; leave: () => ReturnType<typeof leaveClassAction> }) {
  const [state, action, pending] = useActionState(leave, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Leave ${title}? Your teacher can still see the work you submitted.`)) e.preventDefault();
      }}
    >
      <Button type="submit" variant="ghost" className="px-2 py-1 text-muted" disabled={pending}>
        <LogOut className="size-3.5" aria-hidden /> Leave
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
