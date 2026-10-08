"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, Check, Sparkles } from "lucide-react";
import { formatPeso, plans, type PlanInfo } from "@examora/contract";
import { c } from "../_landing/theme";

// The plans side by side, with a monthly/yearly switch. Paid plans can't be bought yet: their buttons start on Free.
export function PlanCards({ startHref, startLabel }: { startHref: string; startLabel: string }) {
  const [yearly, setYearly] = useState(false);
  // Rounded to the centavo: 12 × ₱499.99 − ₱4,999.90.
  const saved = (plan: PlanInfo) => Math.round((plan.monthly * 12 - plan.yearly) * 100) / 100;

  return (
    <div>
      <div className="flex justify-center">
        <div role="radiogroup" aria-label="Billing" className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-1 text-sm font-semibold">
          {[
            [false, "Monthly"],
            [true, "Yearly"],
          ].map(([value, label]) => (
            <button
              key={String(label)}
              type="button"
              role="radio"
              aria-checked={yearly === value}
              onClick={() => setYearly(value as boolean)}
              className={`rounded-lg px-4 py-2 transition-colors ${yearly === value ? "bg-[#c0c1ff] text-[#1000a9]" : `${c.muted} hover:text-white`}`}
            >
              {label}
              {value && <span className={`ml-2 text-xs ${yearly ? "text-[#1000a9]/70" : c.green}`}>2 months free</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-10 grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-3">
        {(["free", "pro", "ai"] as const).map((id) => {
          const plan = plans[id];
          const paid = plan.monthly > 0;
          const featured = id === "pro";
          const price = yearly ? plan.yearly : plan.monthly;
          return (
            <div
              key={id}
              className={`relative flex flex-col rounded-3xl border p-7 sm:p-8 ${
                featured
                  ? "border-[#c0c1ff]/40 bg-gradient-to-b from-[#222a3d] to-[#131b2e] shadow-[0_0_60px_-15px_rgba(192,193,255,0.35)]"
                  : id === "ai"
                    ? "border-[#4edea3]/30 bg-gradient-to-b from-[#16302b] to-[#131b2e]"
                    : `${c.line} ${c.low}`
              }`}
            >
              {featured && (
                <span className="absolute -top-3 left-7 inline-flex items-center gap-1 rounded-full bg-[#c0c1ff] px-3 py-1 text-[11px] font-bold tracking-wide text-[#1000a9] uppercase">
                  <Sparkles className="size-3" aria-hidden /> Most popular
                </span>
              )}
              {id === "ai" && (
                <span className="absolute -top-3 left-7 inline-flex items-center gap-1 rounded-full bg-[#4edea3] px-3 py-1 text-[11px] font-bold tracking-wide text-[#002113] uppercase">
                  <Bot className="size-3" aria-hidden /> AI grading
                </span>
              )}
              <h2 className="font-display text-2xl font-bold">{plan.name}</h2>
              <p className={`mt-1 text-sm ${c.muted}`}>{plan.tagline}</p>
              <p className="mt-6 flex flex-wrap items-baseline gap-x-2">
                <span className="font-display text-4xl font-extrabold tracking-tight text-white xl:text-5xl">
                  {price === 0 ? "₱0" : formatPeso(price)}
                </span>
                <span className={`text-sm ${c.muted}`}>{price === 0 ? "forever" : yearly ? "per year" : "per month"}</span>
              </p>
              <p className={`mt-1 h-5 text-xs ${c.green}`}>
                {paid && yearly && `You save ${formatPeso(saved(plan))} a year.`}
              </p>
              <Link
                href={startHref}
                className={`group mt-6 inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold ${
                  featured
                    ? "bg-[#c0c1ff] text-[#1000a9] hover:bg-[#e1e0ff]"
                    : id === "ai"
                      ? "bg-[#4edea3] text-[#002113] hover:bg-[#6ffbbe]"
                      : "border border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                }`}
              >
                {paid ? "Start free, upgrade later" : startLabel}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              {paid && <p className={`mt-2 text-center text-xs ${c.muted}`}>Payments are coming soon.</p>}
              <ul className="mt-7 space-y-3 text-sm">
                {plan.includes && (
                  <li className={`font-semibold ${id === "ai" ? c.green : c.primary}`}>
                    Everything in {plans[plan.includes].name}, plus:
                  </li>
                )}
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-3">
                    <Check className={`mt-0.5 size-4 shrink-0 ${featured ? c.primary : c.green}`} aria-hidden />
                    <span className={c.text}>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
