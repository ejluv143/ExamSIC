"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
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

// The phone menu: every page with a one-line hint.
const menu = [
  ["home", "Home", Home, "Start here"],
  ["features", "Features", LayoutGrid, "Everything in Examinus"],
  ["how", "How it works", Route, "From class code to grades"],
  ["integrity", "Anti-cheating", ShieldCheck, "Fair exams online"],
  ["class-record", "Class record", Sheet, "Grades in one sheet"],
  ["students", "For students", GraduationCap, "Join with a class code"],
  ["pricing", "Pricing", Tag, "Free to start"],
] as const;

// A floating glass bar: it tightens once the page scrolls, the current page is highlighted, and on phones the
// links open in a glass panel that slides in from the right, over half the screen. Each link is its own page; "home" (null) is the homepage.
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
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  // The panel goes on <body>: the header moves when it tucks away, which would carry a fixed panel with it.
  const onClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

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
              <span className="font-display text-lg font-bold tracking-tight">Examinus</span>
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

      </header>
      {onClient &&
        createPortal(
          <div className="xl:hidden">
            <div
              aria-hidden
              onClick={() => setOpen(false)}
              className={`fixed inset-0 z-50 bg-[#060b17]/60 transition-opacity duration-500 ${open ? "opacity-100 backdrop-blur-md" : "pointer-events-none opacity-0"}`}
            />
            {/* A floating glass card with its own glow; the links slide in one after another. */}
            <aside
              id="site-menu"
              aria-label="Menu"
              inert={!open}
              className={`fixed inset-y-2 right-2 z-50 flex w-1/2 min-w-64 flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-[#151d33]/95 via-[#0e1529]/95 to-[#0b1326]/95 text-[#dae2fd] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] transition-[translate,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                open ? "translate-x-0 opacity-100 backdrop-blur-2xl" : "translate-x-[calc(100%+1rem)] opacity-0"
              }`}
            >
              <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 size-64 rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.45),transparent)]" />
              <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-24 size-64 rounded-full bg-[radial-gradient(closest-side,rgba(78,222,163,0.27),transparent)]" />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:28px_28px]"
              />

              <div className="relative flex items-center justify-between px-4 pt-4">
                <span className="flex items-center gap-2.5">
                  <LogoMark className="size-9" />
                  <span className="flex flex-col leading-none">
                    <span className="font-display text-base font-bold">Examinus</span>
                    <span className="mt-1 text-[9px] font-semibold tracking-[0.22em] text-[#c0c1ff] uppercase">Menu</span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="group grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] transition hover:border-white/25 hover:bg-white/10"
                >
                  <X className="size-4 transition-transform duration-300 group-hover:rotate-90" aria-hidden />
                </button>
              </div>

              <nav aria-label="Sections" className="relative mt-5 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-2.5 pb-4 [mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <ul className="grid gap-1">
                  {menu.map(([id, label, Icon, hint], i) => {
                    const current = id === "home" ? active === null : active === id;
                    return (
                      <li
                        key={id}
                        style={{ transitionDelay: open ? `${120 + i * 45}ms` : "0ms" }}
                        className={`transition-[translate,opacity] duration-500 ease-out ${open ? "translate-x-0 opacity-100" : "translate-x-6 opacity-0"}`}
                      >
                        <Link
                          href={id === "home" ? "/" : pages[id]}
                          aria-current={current ? "page" : undefined}
                          onClick={() => {
                            setOpen(false);
                            if (id === "home" && onHome) window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className={`group relative flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors ${
                            current ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
                          }`}
                        >
                          {current && (
                            <span aria-hidden className="absolute inset-y-2.5 left-0 w-1 rounded-full bg-gradient-to-b from-[#c0c1ff] to-[#4edea3]" />
                          )}
                          <span
                            className={`grid size-9 shrink-0 place-items-center rounded-xl transition ${
                              current
                                ? "bg-gradient-to-br from-[#6366f1] to-[#4edea3] text-white shadow-lg shadow-[#6366f1]/30"
                                : "bg-white/[0.05] text-[#c0c1ff] ring-1 ring-white/10 group-hover:bg-white/10"
                            }`}
                          >
                            <Icon className="size-4" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-sm font-semibold ${current ? "text-white" : "text-[#dae2fd]"}`}>{label}</span>
                            <span className="block truncate text-[11px] text-[#908fa0]">{hint}</span>
                          </span>
                          <span className="font-mono text-[10px] text-white/25 tabular-nums transition-colors group-hover:text-[#4edea3]">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <div
                style={{ transitionDelay: open ? "420ms" : "0ms" }}
                className={`relative grid gap-2 p-3 transition-[translate,opacity] duration-500 ease-out ${open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
              >
                <div className="flex items-center gap-2.5 rounded-2xl border border-[#4edea3]/20 bg-[#4edea3]/[0.07] p-3">
                  <GraduationCap className="size-4 shrink-0 text-[#4edea3]" aria-hidden />
                  <p className="text-[11px] leading-snug text-[#c7c4d7]">
                    <span className="font-semibold text-white">Students are always free.</span> Teachers start free.
                  </p>
                </div>
                {!signedIn && (
                  <Link
                    href="/register?role=teacher"
                    onClick={() => setOpen(false)}
                    className="block rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-sm font-semibold hover:bg-white/[0.07]"
                  >
                    Sign up free
                  </Link>
                )}
                <Link
                  href={cta.href}
                  onClick={() => setOpen(false)}
                  className="group relative flex items-center justify-center gap-1.5 overflow-hidden rounded-2xl bg-[#c0c1ff] px-4 py-3 text-sm font-bold text-[#1000a9] shadow-[0_0_30px_rgba(192,193,255,0.25)] hover:bg-[#e1e0ff]"
                >
                  <span className="absolute inset-y-0 -left-full w-1/2 skew-x-12 bg-white/50 transition-all duration-700 group-hover:left-[150%]" />
                  <span className="relative">{cta.label}</span>
                  <ArrowRight className="relative size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </div>
            </aside>
          </div>,
          document.body,
        )}
    </>
  );
}
