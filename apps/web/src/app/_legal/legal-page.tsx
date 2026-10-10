import type { ReactNode } from "react";
import Link from "next/link";
import { SiteFooter } from "../_landing/site-footer";
import { SiteHeader } from "../_landing/site-header";

// /terms and /privacy: one document in a readable column, with the landing page's header and footer.
export function LegalPage({ title, other, children }: { title: string; other: { href: string; label: string }; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1 px-4 pt-14 pb-24 lg:px-10">
        <article className="mx-auto max-w-3xl">
          <p className="text-xs font-bold tracking-[0.18em] text-primary uppercase">Legal</p>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
          <div className="mt-10 rounded-3xl border border-border bg-surface p-6 sm:p-10">{children}</div>
          <p className="mt-6 text-sm text-muted">
            See also the{" "}
            <Link href={other.href} className="font-semibold text-primary hover:underline">
              {other.label}
            </Link>
            .
          </p>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
