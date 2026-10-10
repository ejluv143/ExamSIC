"use client";

import { useState } from "react";
import Link from "next/link";
import { DoorOpen, Menu, X } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { ThemeMenu } from "@/components/theme-menu";
import { useHome } from "./session";

const sections = [
  ["/#features", "Features"],
  ["/#analytics", "Analytics"],
  ["/#how", "How it works"],
  ["/#pricing", "Pricing"],
] as const;

// The bar at the top of the landing and legal pages: the sections, appearance, "Enter a room" for students with a
// room key, and sign-in (or the way back in for a signed-in visitor).
export function SiteHeader() {
  const home = useHome();
  const [open, setOpen] = useState(false);
  const account = home ? { href: home, label: "Open Examinus" } : { href: "/login", label: "Sign in" };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 lg:px-8">
        <Link href="/" className="mr-auto flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
          <LogoMark className="size-8" />
          <span className="max-[400px]:sr-only">Examinus</span>
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-1 text-sm font-medium lg:flex">
          {sections.map(([href, label]) => (
            <a key={href} href={href} className="rounded-lg px-3 py-2 text-muted hover:bg-surface-muted hover:text-foreground">
              {label}
            </a>
          ))}
        </nav>
        <ThemeMenu placement="header" />
        <Link
          href="/join"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-surface-muted"
        >
          <DoorOpen className="size-4" aria-hidden />
          Enter a room
        </Link>
        <Link
          href={account.href}
          className="hidden h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover lg:inline-flex"
        >
          {account.label}
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="site-menu"
          className="grid size-9 place-items-center rounded-lg border border-border lg:hidden"
        >
          {open ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
          <span className="sr-only">Menu</span>
        </button>
      </div>
      {open && (
        <nav id="site-menu" aria-label="Sections" className="border-t border-border px-4 py-3 lg:hidden">
          {sections.map(([href, label]) => (
            <a key={href} href={href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface-muted">
              {label}
            </a>
          ))}
          <Link
            href={account.href}
            className="mt-2 flex h-10 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
          >
            {account.label}
          </Link>
        </nav>
      )}
    </header>
  );
}
