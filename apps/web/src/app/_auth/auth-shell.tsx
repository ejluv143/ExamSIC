import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { ThemeMenu } from "@/components/theme-menu";

// The frame of the sign-in and sign-up pages, in the landing page's style: a dotted grid with a glow in the accent
// colour, a bar with the logo, the way home and the Appearance menu, the form in a card, and on wide screens a
// headline with drawn product cards beside it. Everything uses the theme's tokens, so it follows light and dark mode
// and the visitor's accent.
export function AuthShell({
  eyebrow,
  headline,
  highlight,
  lead,
  showcase,
  children,
}: {
  eyebrow: string;
  // The headline's first part, and the part drawn in the gradient.
  headline: string;
  highlight: string;
  lead: string;
  showcase: ReactNode;
  // The form card's contents.
  children: ReactNode;
}) {
  return (
    <div className="relative isolate flex min-h-screen flex-1 flex-col overflow-clip bg-background text-foreground">
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="bg-dots absolute inset-0 [mask-image:radial-gradient(ellipse_80%_70%_at_30%_30%,black,transparent)]" />
        <div className="absolute -top-48 -left-32 h-[34rem] w-[46rem] rounded-full bg-[color-mix(in_oklab,var(--primary)_20%,transparent)] blur-3xl" />
        <div className="absolute -right-40 -bottom-40 h-96 w-96 rounded-full bg-[color-mix(in_oklab,var(--success)_12%,transparent)] blur-3xl" />
      </div>

      <header className="border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="mr-auto flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
            <LogoMark className="size-8" />
            Examinus
          </Link>
          <ThemeMenu placement="header" />
          <Link
            href="/"
            className="group inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm font-medium text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
            <span className="max-sm:sr-only">Back to home</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 py-10 lg:grid-cols-[1fr_minmax(0,28rem)] lg:gap-16 lg:py-16">
        <section className="hidden lg:block">
          <p className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-primary uppercase">
            <span aria-hidden className="h-px w-6 bg-primary" />
            {eyebrow}
          </p>
          <h2 className="mt-4 max-w-xl font-display text-5xl leading-[1.05] font-extrabold tracking-tight text-balance">
            {headline} <span className="text-gradient">{highlight}</span>
          </h2>
          <p className="mt-5 max-w-lg text-lg text-pretty text-muted">{lead}</p>
          <div className="mt-12 [@media(max-height:760px)]:hidden">{showcase}</div>
        </section>

        <section className="mx-auto w-full max-w-md lg:max-w-none">
          <div className="rounded-3xl border border-border bg-surface p-7 shadow-2xl shadow-black/10 sm:p-9">{children}</div>
        </section>
      </main>
    </div>
  );
}

// A small card of the drawn product, floating beside the headline (aria-hidden: decoration).
export function ShowcaseCard({ className = "", delay = 0, children }: { className?: string; delay?: number; children: ReactNode }) {
  return (
    <div
      aria-hidden
      className={`animate-float rounded-2xl border border-border bg-surface/95 p-4 text-xs shadow-xl shadow-black/10 backdrop-blur ${className}`}
      style={{ animationDelay: `${-delay}s` }}
    >
      {children}
    </div>
  );
}
