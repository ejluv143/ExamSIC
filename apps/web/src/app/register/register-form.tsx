"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Button, Field, inputClass } from "@/components/ui";
import { register } from "./actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState(register, undefined);
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [showPassword, setShowPassword] = useState(false);

  if (state && "registered" in state) {
    return (
      <div role="status" className="mt-8 space-y-4 rounded-xl border border-border bg-surface p-6 text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
        <div>
          <p className="font-semibold">Account created</p>
          <p className="mt-1 text-sm text-muted">
            An administrator needs to approve <span className="font-medium text-foreground">{state.registered}</span>{" "}
            before you can sign in. You can also use Continue with Google with this address once it&apos;s approved.
          </p>
        </div>
        <Link href="/login" className="inline-block text-sm font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  const values = state && "values" in state ? state.values : undefined;
  return (
    <form action={action} className="mt-8 space-y-4" noValidate>
      <div role="radiogroup" aria-label="I am a" className="grid grid-cols-2 gap-1 rounded-lg bg-surface-muted p-1 text-sm">
        {(["student", "teacher"] as const).map((r) => (
          <label
            key={r}
            className={clsx(
              "cursor-pointer rounded-md px-3 py-2 text-center font-medium capitalize focus-within:outline-2 focus-within:outline-primary",
              role === r ? "bg-surface shadow-sm" : "text-muted hover:text-foreground",
            )}
          >
            <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
            {r}
          </label>
        ))}
      </div>
      <Field label="Full name">
        <input name="name" defaultValue={values?.name} autoComplete="name" required placeholder="Surname, First name M.I." className={inputClass} />
      </Field>
      <Field label="Email">
        <input name="email" defaultValue={values?.email} type="email" autoComplete="email" required placeholder="you@gmail.com" className={inputClass} />
      </Field>
      {role === "student" ? (
        <Field label="Student number" hint="As on your school ID. It links your account to your classes.">
          <input name="studentId" defaultValue={values?.studentId} required placeholder="e.g. 2023-10537" className={inputClass} />
        </Field>
      ) : (
        <Field label="Department">
          <input name="department" defaultValue={values?.department} required placeholder="e.g. School of Information Technology" className={inputClass} />
        </Field>
      )}
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            className={`${inputClass} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted hover:text-foreground"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
      </div>
      <Field label="Confirm password">
        <input name="confirm" type={showPassword ? "text" : "password"} autoComplete="new-password" required className={inputClass} />
      </Field>
      {state && "error" in state && (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full py-2.5" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
