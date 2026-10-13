"use client";

import Link from "next/link";
import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import { useHome } from "./session";

// The main call to action: sign up as a teacher, or, once the visitor turns out to be signed in, back into their area.
// `inverse` is for a panel filled with the accent colour.
export function StartLink({ inverse = false }: { inverse?: boolean }) {
  const home = useHome();
  return (
    <Link
      href={home ?? "/register?role=teacher"}
      className={clsx(
        "group inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold transition hover:-translate-y-0.5",
        inverse
          ? "bg-primary-foreground text-primary hover:opacity-90"
          : "bg-primary text-primary-foreground shadow-lg shadow-[color-mix(in_oklab,var(--primary)_35%,transparent)] hover:bg-primary-hover",
      )}
    >
      {home ? "Open Examinus" : "Start free"}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
