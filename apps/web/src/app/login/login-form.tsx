"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { AuthLoading, FormLoading } from "@/components/auth-loading";
import { GoogleButton, OrDivider } from "@/components/google-button";
import { Button, Field, inputClass } from "@/components/ui";
import { login, loginWithGoogle } from "./actions";

export function LoginForm({
  next,
  googleEnabled,
  googleError,
  notice,
}: {
  next: string;
  googleEnabled: boolean;
  googleError: string | null;
  notice: string | null;
}) {
  const [state, action, pending] = useActionState(login, undefined);
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className="mt-8 space-y-6">
      <AuthLoading show={pending} title="Signing you in…" detail="Checking your account and opening your classes." />
      {notice && (
        <p role="status" className="rounded-lg bg-primary-soft p-3 text-sm text-primary">
          {notice}
        </p>
      )}
      <form action={loginWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <GoogleButton enabled={googleEnabled} />
        <FormLoading title="Opening Google…" detail="Choose your Google account on the next page." />
        {googleError && (
          <p role="alert" className="mt-2 rounded-lg bg-danger-soft p-3 text-sm text-danger">
            {googleError}
          </p>
        )}
      </form>

      <OrDivider>or with email</OrDivider>

      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <Field label="Email">
          <input
            name="email"
            type="email"
            autoComplete="username"
            defaultValue={state?.email}
            placeholder="you@school.edu"
            required
            aria-invalid={!!state?.error}
            className={inputClass}
          />
        </Field>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              aria-invalid={!!state?.error}
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
        </div>
        {state?.error && (
          <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" className="w-full py-2.5" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
