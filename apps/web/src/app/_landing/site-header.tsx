"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, GraduationCap, Home, LayoutGrid, Menu, Route, Sheet, ShieldCheck, Tag, X } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { ScrollEffects } from "./scroll-effects";

const sections = [
  ["features", "Features", LayoutGrid],
  ["how", "How it works", Route],
  ["integrity", "Anti-cheating", ShieldCheck],
  ["class-record", "Class record", Sheet],
  ["students", "For students", GraduationCap],
  ["pricing", "Pricing", Tag],
] as const;

// A floating glass bar: it tightens once the page scrolls, the current page is highlighted, and on phones the
// links open in a panel. Each link is its own page; "home" (null) is the homepage.
const pages: Record<string, string> = {
  features: "/features",
  how: "/how-it-works",
  integrity: "/anti-cheating",
  "class-record": "/class-record",
  students: "/for-students",
  pricing: "/pricing",
};

export function SiteHeader({ cta, signedIn }: { cta: { href: string; label: string }; signedIn: boolean }) {
  const pathname = usePathname();
  const onHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  // Out of the way while scrolling down; back as soon as the page scrolls up.
  const [tucked, setTucked] = useState(false);
  const active = onHome ? null : (Object.keys(pages).find((id) => pages[id] === pathname) ?? "page");
  const [open, setOpen] = useState(false);
  const nav = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      if (Math.abs(y - last) > 6) {
        setTucked(y > last && y > 160);
        last = y;
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Sticky bars below the header (the features filters, the how-it-works steps) sit at --header-h.
  const hidden = tucked && !open;
  useEffect(() => {
    document.documentElement.style.setProperty("--header-h", hidden ? "12px" : "76px");
  }, [hidden]);

  useLayoutEffect(() => {
    const link = nav.current?.querySelector<HTMLElement>(`[data-id="${active ?? "home"}"]`);
    setPill(link ? { left: link.offsetLeft, width: link.offsetWidth } : null);
  }, [active]);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <>
      {/* Outside the header, so its fixed progress line doesn't slide away with it. */}
      <ScrollEffects />
      <header className={`sticky top-0 z-40 px-3 pt-3 transition-transform duration-300 ease-out sm:px-4 ${hidden ? "-translate-y-[130%]" : ""}`}>
        <div
          className={`mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-2xl border px-3 transition-all duration-300 sm:px-4 ${
            scrolled
              ? "h-14 max-w-6xl border-white/10 bg-[#0b1326]/75 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)] backdrop-blur-xl"
              : "h-16 border-transparent bg-transparent"
          }`}
        >
          <Link href="/" className="group flex items-center gap-2.5" onClick={() => setOpen(false)}>
            <LogoMark className={`transition-all duration-300 group-hover:scale-105 ${scrolled ? "size-9" : "size-10"}`} />
            <span className="flex flex-col leading-none">
              <span className="font-display text-lg font-bold tracking-tight">Examora</span>
              <span className="mt-1 hidden text-[9px] font-semibold tracking-[0.22em] whitespace-nowrap text-[#c0c1ff] uppercase sm:block xl:hidden 2xl:block">Quizzes · Exams · Records</span>
            </span>
          </Link>

          <nav aria-label="Sections" className="hidden xl:block">
            <div ref={nav} className="relative flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 text-[13px] font-semibold">
              {pill && (
                <span
                  aria-hidden
                  className="absolute inset-y-1 rounded-lg bg-gradient-to-r from-[#c0c1ff]/20 to-[#4edea3]/15 ring-1 ring-white/10 transition-all duration-300"
                  style={{ left: pill.left, width: pill.width }}
                />
              )}
              <Link
                href="/"
                data-id="home"
                aria-current={active === null ? "page" : undefined}
                onClick={() => onHome && window.scrollTo({ top: 0, behavior: "smooth" })}
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 whitespace-nowrap transition-colors ${active === null ? "text-white" : "text-[#c7c4d7] hover:text-white"}`}
              >
                <Home className={`size-3.5 ${active === null ? "text-[#4edea3]" : ""}`} aria-hidden /> Home
              </Link>
              {sections.map(([id, label, Icon]) => (
                <Link
                  key={id}
                  href={pages[id]}
                  data-id={id}
                  aria-current={active === id ? "location" : undefined}
                  className={`group/link relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 whitespace-nowrap transition-colors ${active === id ? "text-white" : "text-[#c7c4d7] hover:text-white"}`}
                >
                  <Icon className={`size-3.5 transition-colors ${active === id ? "text-[#4edea3]" : "group-hover/link:text-[#c0c1ff]"}`} aria-hidden />
                  {label}
                </Link>
              ))}
            </div>
          </nav>

          <div className="flex items-center gap-2">
            {!signedIn && (
              <Link href="/register?role=teacher" className="hidden rounded-lg px-3 py-2 text-[13px] font-semibold whitespace-nowrap text-[#dae2fd] hover:bg-white/5 sm:block xl:hidden 2xl:block">
                Sign up free
              </Link>
            )}
            <Link
              href={cta.href}
              className="group relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg bg-[#c0c1ff] px-3.5 py-2 whitespace-nowrap sm:px-4 text-[13px] font-bold text-[#1000a9] shadow-[0_0_24px_rgba(192,193,255,0.3)] hover:bg-[#e1e0ff]"
            >
              {/* A shine that crosses the button on hover. */}
              <span className="absolute inset-y-0 -left-full w-1/2 skew-x-12 bg-white/50 transition-all duration-700 group-hover:left-[150%]" />
              <span className="relative">{cta.label}</span>
              <ArrowRight className="relative size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="site-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              className="grid size-9 place-items-center rounded-lg border border-white/10 text-[#dae2fd] hover:bg-white/5 xl:hidden"
            >
              {open ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>

        {/* Phones, tablets and small laptops */}
        <div
          id="site-menu"
          hidden={!open}
          className="mx-auto mt-2 max-w-7xl rounded-2xl border border-white/10 bg-[#0b1326]/95 p-2 shadow-2xl backdrop-blur-xl motion-safe:animate-[fade-in_0.2s_ease-out] xl:hidden"
        >
          <nav aria-label="Sections" className="grid">
            <Link
              href="/"
              onClick={() => {
                setOpen(false);
                if (onHome) window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold ${
                active === null ? "bg-white/[0.06] text-white" : "text-[#c7c4d7] hover:bg-white/[0.04]"
              }`}
            >
              <span className="flex items-center gap-2">
                <Home className="size-4" aria-hidden /> Home
              </span>
              <ArrowRight className="size-4 opacity-40" aria-hidden />
            </Link>
            {sections.map(([id, label, Icon]) => (
              <Link
                key={id}
                href={pages[id]}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold ${
                  active === id ? "bg-white/[0.06] text-white" : "text-[#c7c4d7] hover:bg-white/[0.04]"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon className={`size-4 ${active === id ? "text-[#4edea3]" : ""}`} aria-hidden /> {label}
                </span>
                <ArrowRight className="size-4 opacity-40" aria-hidden />
              </Link>
            ))}
          </nav>
          {!signedIn && (
            <Link
              href="/register?role=teacher"
              className="mt-2 block rounded-xl border border-white/10 px-4 py-3 text-center text-sm font-semibold text-[#dae2fd] hover:bg-white/[0.04]"
            >
              Sign up free
            </Link>
          )}
        </div>
      </header>
    </>
  );
}
