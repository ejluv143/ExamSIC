"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useHome } from "./session";

// The main call to action: sign up as a teacher, or, once the visitor turns out to be signed in, back into their area.
export function StartLink() {
  const home = useHome();
  return (
    <Link
      href={home ?? "/register?role=teacher"}
      className="group inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
    >
      {home ? "Open Examinus" : "Sign up free"}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
