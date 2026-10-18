"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { GoogleButton, OrDivider } from "@/features/auth/components/google-button";
import { Button, Field, inputClass } from "@/components/ui";
import { login, loginWithGoogle } from "../actions";

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
  const [result, action, pending] = useActionState(login, undefined);
  const state = result && "error" in result ? result : undefined;
  const resume = result && "resume" in result ? result.resume : null;
  // Back to the API's authorization endpoint as a full page load (actions.ts).
  useEffect(() => {
    if (resume) window.location.assign(resume);
  }, [resume]);
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className="mt-8 space-y-6">
      {notice && (
        <p role="status" className="rounded-lg bg-primary-soft p-3 text-sm text-primary">
          {notice}
        </p>
      )}
      <form action={loginWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <GoogleSubmit enabled={googleEnabled} />
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
        <Button type="submit" className="w-full py-2.5" disabled={pending || resume !== null}>
          {(pending || resume) && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {pending || resume ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}

// The Google button of its own form: spins while the way to Google is being prepared.
function GoogleSubmit({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <GoogleButton enabled={enabled} pending={pending}>
      {pending ? "Opening Google…" : "Continue with Google"}
    </GoogleButton>
  );
}
