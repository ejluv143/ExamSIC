"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AuthLoading } from "@/components/auth-loading";
import { GoogleButton, OrDivider } from "@/components/google-button";
import { Button, Field, inputClass } from "@/components/ui";
import { register, registerWithGoogle } from "./actions";
import { PasswordFields } from "./password-fields";
import { LegalDialog } from "@/components/legal/legal-dialog";
import { PrivacyPolicy, TermsOfService } from "@/components/legal/documents";

export function RegisterForm({
  googleEnabled,
  googleResult,
  initialRole,
}: {
  googleEnabled: boolean;
  // A Google sign-up that came back failed.
  googleResult: "failed" | null;
  // From /register?role=…, so "Sign up as a teacher" links open on the teacher tab.
  initialRole: "student" | "teacher";
}) {
  const [emailState, action, emailPending] = useActionState(register, undefined);
  const [googleState, googleAction, googlePending] = useActionState(registerWithGoogle, undefined);
  const [lastUsed, setLastUsed] = useState<"email" | "google">("email");
  const state = lastUsed === "google" ? googleState : emailState;
  const pending = emailPending || googlePending;
  const [role, setRole] = useState<"student" | "teacher">(initialRole);
  // Kept across a failed submit, like the passwords.
  const [agreed, setAgreed] = useState(false);

  const values = state && "values" in state ? state.values : undefined;
  return (
    <form action={action} className="mt-8 space-y-4" noValidate>
      <AuthLoading
        show={pending}
        title={googlePending ? "Opening Google…" : "Creating your account…"}
        detail={googlePending ? "Choose your Google account on the next page." : "Setting things up and signing you in."}
      />
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
      <GoogleButton enabled={googleEnabled} formAction={googleAction} formNoValidate onClick={() => setLastUsed("google")}>
        {googlePending ? "Opening Google…" : "Sign up with Google"}
      </GoogleButton>
      {googleResult === "failed" && lastUsed === "email" && !emailState && (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          Google sign-up didn&apos;t work. Try again, or create the account with your email below.
        </p>
      )}
      <OrDivider>or with email and a password</OrDivider>
      <Field label="Full name">
        <input name="name" defaultValue={values?.name} autoComplete="name" required placeholder="Surname, First name M.I." className={inputClass} />
      </Field>
      <Field label="Email">
        <input name="email" defaultValue={values?.email} type="email" autoComplete="email" required placeholder="you@gmail.com" className={inputClass} />
      </Field>
      <PasswordFields />
      <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-muted/50 p-3 text-sm">
        <input
          type="checkbox"
          name="acceptTerms"
          value="yes"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          required
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <span>
          I agree to Examinus&apos;s{" "}
          <LegalDialog label="Terms of Service" title="Terms of Service">
            <TermsOfService />
          </LegalDialog>{" "}
          and{" "}
          <LegalDialog label="Privacy Policy" title="Privacy Policy">
            <PrivacyPolicy />
          </LegalDialog>
          , including how my information is used for my classes.
        </span>
      </label>
      {state && "error" in state && (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full py-2.5" disabled={pending} onClick={() => setLastUsed("email")}>
        {emailPending ? "Creating account…" : "Create account"}
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
