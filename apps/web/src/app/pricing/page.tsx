import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Result } from "effect";
import { GraduationCap } from "lucide-react";
import { formatPeso, homeFor, plans } from "@examora/contract";
import { callApi, forwardedHeaders } from "@/lib/api/client";
import { SiteFooter } from "../_landing/site-footer";
import { SiteHeader } from "../_landing/site-header";
import { Backdrop, c, Eyebrow } from "../_landing/theme";
import { PlanCards } from "./plan-cards";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Examora is free for teachers to start, and always free for students. Pro is ${formatPeso(plans.pro.monthly)} a month.`,
};

const faq: [string, string][] = [
  ["Do students pay?", "No. Students sign up for free and join their teachers' classes with a class code."],
  [
    "How do I upgrade to Pro?",
    "Payments are coming soon. Start on Free today; your classes, quizzes and records stay when you upgrade.",
  ],
  ["What happens if Pro ends?", "You're back on Free. Nothing is deleted: your classes, questions and records stay."],
  ["Is there a contract?", "No. Pay monthly, or yearly for two months free."],
];

export default async function PricingPage() {
  const session = await callApi((api) => api["auth.session"](), forwardedHeaders(await headers()));
  const home = Result.isSuccess(session) ? homeFor(session.success.user.role) : null;
  const cta = home ? { href: home, label: "Open Examora" } : { href: "/login", label: "Sign in" };
  const start = home ? { href: home, label: "Open Examora" } : { href: "/register?role=teacher", label: "Sign up free" };

  return (
    <div id="top" className={`${c.bg} ${c.text} min-h-full antialiased`}>
      <SiteHeader cta={cta} signedIn={home !== null} />

      <main className="overflow-x-clip">
        <section className="relative isolate pt-14 pb-20 lg:pt-20">
          <Backdrop
            photo="1513258496099-48168024aec0"
            className="inset-x-0 -top-24 h-[560px]"
            shade="bg-[#0b1326]/80"
            mask="linear-gradient(to bottom, black 0%, black 30%, transparent 100%)"
          />
          <div className="mx-auto max-w-7xl px-4 text-center lg:px-10">
            <Eyebrow tone={c.green}>Pricing</Eyebrow>
            <h1 className="mx-auto mt-3 max-w-3xl font-display text-[36px] leading-tight font-extrabold tracking-tight sm:text-[56px]">
              Free to start,{" "}
              <span className="bg-gradient-to-r from-[#c0c1ff] via-[#d0bcff] to-[#4edea3] bg-clip-text text-transparent">
                simple to grow
              </span>
            </h1>
            <p className={`mx-auto mt-5 max-w-2xl text-lg leading-relaxed ${c.muted}`}>
              Sign up as a teacher, create a class and share its code. Upgrade to Pro when you want the whole course in
              Examora.
            </p>
          </div>
          <div className="mt-12 px-4 lg:px-10">
            <PlanCards startHref={start.href} startLabel={start.label} />
          </div>

          <div className="mx-auto mt-10 max-w-5xl px-4 lg:px-10">
            <div className={`flex flex-col items-start gap-4 rounded-2xl border ${c.line} ${c.low} p-5 sm:flex-row sm:items-center`}>
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#4edea3]/15 text-[#4edea3]">
                <GraduationCap className="size-5" aria-hidden />
              </span>
              <div className="flex-1">
                <p className="font-semibold text-white">Students are always free</p>
                <p className={`text-sm ${c.muted}`}>Sign up, then join your teacher&apos;s class with its code.</p>
              </div>
              {!home && (
                <Link
                  href="/register?role=student"
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/[0.06]"
                >
                  Join a class
                </Link>
              )}
            </div>
          </div>
        </section>

        <section className="px-4 pb-24 lg:px-10">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-center font-display text-3xl font-bold tracking-tight">Questions</h2>
            <dl className="mt-8 divide-y divide-white/10 rounded-2xl border border-white/10">
              {faq.map(([q, a]) => (
                <div key={q} className="p-5">
                  <dt className="font-semibold text-white">{q}</dt>
                  <dd className={`mt-1.5 text-sm leading-relaxed ${c.muted}`}>{a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <SiteFooter cta={cta} signedIn={home !== null} />
    </div>
  );
}
