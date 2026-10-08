"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Image from "next/image";
import { ListChecks, Search, X } from "lucide-react";
import { c } from "../_landing/theme";
import { categories, questionTypes, type Audience, type Category, type Feature } from "./data";
import { TypePreview } from "./type-preview";

const audiences: ("Everyone" | Audience)[] = ["Everyone", "Teachers", "Students", "Admins"];

// A light that follows the pointer across a card.
function track(e: MouseEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--x", `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty("--y", `${e.clientY - rect.top}px`);
}

function Tags({ who }: { who: Audience[] }) {
  return (
    <p className="mt-3 flex flex-wrap gap-1">
      {who.map((w) => (
        <span key={w} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10.5px] font-semibold text-[#c7c4d7]">
          {w}
        </span>
      ))}
    </p>
  );
}

function FeatureCard({ f, tone, spotlight }: { f: Feature; tone: string; spotlight: boolean }) {
  return (
    <li
      onMouseMove={track}
      className={`group relative overflow-hidden rounded-3xl border border-white/10 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 ${
        spotlight ? "sm:col-span-2" : ""
      }`}
      style={{ background: spotlight ? `linear-gradient(135deg, ${tone}1f, #131b2e 55%)` : "#131b2e" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(360px circle at var(--x, 50%) var(--y, 0%), ${tone}22, transparent 60%)` }}
      />
      {spotlight && (
        <f.icon aria-hidden className="pointer-events-none absolute -right-6 -bottom-6 size-40 opacity-[0.07]" style={{ color: tone }} />
      )}
      <div className={`relative ${spotlight ? "max-w-xl" : ""}`}>
        <span
          className={`grid place-items-center rounded-xl bg-white/5 ring-1 ring-white/10 ${spotlight ? "size-12" : "size-10"}`}
          style={{ color: tone }}
        >
          <f.icon className={spotlight ? "size-6" : "size-5"} aria-hidden />
        </span>
        <h3 className={`mt-4 font-display font-semibold ${spotlight ? "text-xl" : ""}`}>{f.title}</h3>
        <p className={`mt-1.5 leading-relaxed ${spotlight ? "text-[15px]" : "text-sm"} ${c.muted}`}>{f.text}</p>
        <Tags who={f.who} />
      </div>
    </li>
  );
}

// A photo banner: the category's number, icon, title and count over a darkened Unsplash photo tinted in its color.
function CategoryHeading({
  n,
  icon: Icon,
  photo,
  title,
  text,
  tone,
  count,
}: {
  n: number;
  icon: Category["icon"];
  photo: string;
  title: string;
  text: string;
  tone: string;
  count?: number;
}) {
  return (
    <div className="group relative isolate overflow-hidden rounded-3xl border border-white/10">
      <Image
        src={`https://images.unsplash.com/photo-${photo}`}
        alt=""
        fill
        sizes="(min-width: 1024px) 70vw, 100vw"
        className="-z-20 object-cover transition-transform duration-700 group-hover:scale-105"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0b1326] via-[#0b1326]/70 to-transparent" />
      <div className="absolute inset-0 -z-10 opacity-40 mix-blend-color" style={{ background: `linear-gradient(120deg, transparent 40%, ${tone})` }} />
      <div className="flex min-h-48 items-end gap-5 p-6 sm:min-h-56 sm:p-8">
        {n > 0 && (
          <span
            aria-hidden
            className="hidden self-start font-display text-7xl leading-none font-extrabold text-transparent sm:block"
            style={{ WebkitTextStroke: `1.5px ${tone}` }}
          >
            {String(n).padStart(2, "0")}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl backdrop-blur" style={{ background: `${tone}33`, color: tone }}>
              <Icon className="size-5" aria-hidden />
            </span>
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
            {count !== undefined && (
              <span className="rounded-full border border-white/15 bg-[#0b1326]/60 px-2.5 py-0.5 text-xs font-semibold text-[#dae2fd] backdrop-blur">
                {count} {count === 1 ? "feature" : "features"}
              </span>
            )}
          </div>
          <p className="mt-2 max-w-2xl text-[#dae2fd]/85">{text}</p>
        </div>
      </div>
    </div>
  );
}

// Every feature, filterable by who uses it and by a search, with a category menu that follows the scroll.
export function FeatureExplorer() {
  const [who, setWho] = useState<"Everyone" | Audience>("Everyone");
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState("types");
  const seg = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      categories
        .map((cat) => ({
          ...cat,
          features: cat.features.filter(
            (f) => (who === "Everyone" || f.who.includes(who)) && (!q || `${f.title} ${f.text}`.toLowerCase().includes(q)),
          ),
        }))
        .filter((cat) => cat.features.length > 0),
    [who, q],
  );
  const count = shown.reduce((n, cat) => n + cat.features.length, 0);
  const typesShown =
    who !== "Admins" && (!q || "question types".includes(q) || questionTypes.some((t) => `${t.name} ${t.subjects}`.toLowerCase().includes(q)));

  useLayoutEffect(() => {
    const b = seg.current?.querySelector<HTMLElement>(`[data-who="${who}"]`);
    if (b) setPill({ left: b.offsetLeft, width: b.offsetWidth });
  }, [who]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(e.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    document.querySelectorAll("[data-category]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [shown, typesShown]);

  const menu = [
    ...(typesShown ? [{ id: "types", title: "Question types", tone: "#c0c1ff" }] : []),
    ...shown.map(({ id, title, tone }) => ({ id, title, tone })),
  ];

  return (
    <>
      {/* Filters */}
      <div className="sticky top-(--header-h,76px) z-30 transition-[top] duration-300 -mx-4 mb-12 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:border-white/10 sm:bg-[#0b1326]/75 sm:px-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div ref={seg} role="radiogroup" aria-label="Who it's for" className="relative flex w-fit flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {pill && (
              <span
                aria-hidden
                className="absolute inset-y-1 rounded-lg bg-[#c0c1ff] shadow-[0_0_20px_rgba(192,193,255,0.35)] transition-all duration-300"
                style={{ left: pill.left, width: pill.width }}
              />
            )}
            {audiences.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                data-who={a}
                aria-checked={who === a}
                onClick={() => setWho(a)}
                className={`relative rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${who === a ? "text-[#1000a9]" : `${c.muted} hover:text-white`}`}
              >
                {a}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <p aria-live="polite" className={`hidden text-sm whitespace-nowrap lg:block ${c.muted}`}>
              <span className="font-semibold text-white">{count}</span> {count === 1 ? "feature" : "features"}
            </p>
            <label className="relative block w-full md:w-80">
              <span className="sr-only">Search features</span>
              <Search className={`pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 ${c.muted}`} aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search: essay, Excel, Google…"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2 pr-9 pl-9 text-sm text-white placeholder:text-[#c7c4d7]/50 focus:border-[#c0c1ff]/50 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className={`absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md ${c.muted} hover:bg-white/10`}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </label>
          </div>
        </div>
      </div>

      <div className="grid gap-12 lg:grid-cols-[240px_1fr]">
        {/* Category menu */}
        <nav aria-label="Categories" className="hidden lg:block">
          <ul className="sticky top-[calc(var(--header-h,76px)+100px)] space-y-0.5 transition-[top] duration-300">
            {menu.map((m) => (
              <li key={m.id}>
                <a
                  href={`#${m.id}`}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    current === m.id ? "bg-white/[0.05] font-semibold text-white" : `${c.muted} hover:text-white`
                  }`}
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full transition-transform"
                    style={{ background: m.tone, transform: current === m.id ? "scale(1.6)" : "scale(1)", opacity: current === m.id ? 1 : 0.4 }}
                  />
                  {m.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-24">
          {count === 0 && !typesShown && (
            <p className={`rounded-2xl border border-dashed border-white/15 p-10 text-center ${c.muted}`}>
              Nothing matches &ldquo;{query}&rdquo;. Try another word, or show everyone&apos;s features.
            </p>
          )}

          {typesShown && (
            <section id="types" data-category className="scroll-mt-44">
              <CategoryHeading
                n={0}
                icon={ListChecks}
                photo="1484480974693-6ca0a78fb36b"
                tone="#c0c1ff"
                title="Question types"
                text="Nine kinds of questions. The subject decides which ones the editor offers. Pick one to see it answered."
              />
              <div className="mt-8">
                <TypePreview />
              </div>
            </section>
          )}

          {shown.map((cat) => {
            const n = categories.findIndex((x) => x.id === cat.id) + 1;
            return (
              <section key={cat.id} id={cat.id} data-category className="relative scroll-mt-44">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-16 -left-24 -z-10 h-64 w-96 rounded-full blur-[110px]"
                  style={{ background: `${cat.tone}14` }}
                />
                <CategoryHeading n={n} icon={cat.icon} photo={cat.photo} tone={cat.tone} title={cat.title} text={cat.text} count={cat.features.length} />
                <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                  {cat.features.map((f, i) => (
                    <FeatureCard key={f.title} f={f} tone={cat.tone} spotlight={cat.features.length > 2 && (i === 0 || i === cat.features.length - 1)} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
