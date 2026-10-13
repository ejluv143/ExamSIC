import Link from "next/link";
import { Check } from "lucide-react";
import { formatPeso, plans } from "@examinus/domain/plans";
import { planNames } from "@examinus/domain/roles";
import { revealDelay } from "./reveal";
import { SectionHeading } from "./section-heading";

// The plans with what each adds; Pro stands out with an accent border and a badge.
export function Pricing() {
  return (
    <section aria-labelledby="pricing" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading id="pricing" eyebrow="Pricing" title="Free to start. Fair when you grow." text="Students never pay. Paid plans are coming soon." />
        <ul className="mt-14 grid gap-5 lg:grid-cols-3">
          {planNames.map((id, i) => {
            const plan = plans[id];
            const featured = id === "pro";
            return (
              <li
                key={id}
                data-reveal
                style={revealDelay(i * 100)}
                className={`relative flex flex-col rounded-3xl border p-7 ${
                  featured
                    ? "border-primary bg-[color-mix(in_oklab,var(--primary)_6%,var(--surface))] shadow-2xl shadow-[color-mix(in_oklab,var(--primary)_20%,transparent)] lg:-translate-y-3"
                    : "border-border bg-surface"
                }`}
              >
                {featured && (
                  <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Recommended</span>
                )}
                <h3 className="font-display text-xl font-semibold">{plan.name}</h3>
                <p className="mt-2 text-sm text-muted">{plan.tagline}</p>
                <p className="mt-6 flex items-baseline gap-1.5">
                  <span className="font-display text-4xl font-extrabold tracking-tight">{plan.monthly === 0 ? "₱0" : formatPeso(plan.monthly)}</span>
                  <span className="text-sm text-muted">{plan.monthly === 0 ? "forever" : "/ month"}</span>
                </p>
                <Link
                  href="/register?role=teacher"
                  className={`mt-6 inline-flex h-11 items-center justify-center rounded-full text-sm font-semibold ${
                    featured ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "border border-border hover:bg-surface-muted"
                  }`}
                >
                  {plan.monthly === 0 ? "Start free" : "Start free, upgrade later"}
                </Link>
                <ul className="mt-7 space-y-2.5 border-t border-border pt-6 text-sm">
                  {plan.includes && <li className="font-semibold">Everything in {plans[plan.includes].name}, plus:</li>}
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
