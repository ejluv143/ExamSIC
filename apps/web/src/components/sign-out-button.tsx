"use client";

import { useFormStatus } from "react-dom";
import { Loader2, LogOut } from "lucide-react";

// The submit button of the sign-out form: a spinner replaces the icon while the session ends.
export function SignOutButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      title="Sign out"
      aria-label={pending ? "Signing out" : "Sign out"}
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg p-2 text-sm text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
    </button>
  );
}
