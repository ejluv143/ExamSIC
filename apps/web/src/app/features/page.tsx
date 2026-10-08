import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Result } from "effect";
import { ArrowRight } from "lucide-react";
import { homeFor } from "@examora/contract";
import { callApi, forwardedHeaders } from "@/lib/api/client";
import { SiteFooter } from "../_landing/site-footer";
import { SiteHeader } from "../_landing/site-header";
import { Backdrop, c, Eyebrow } from "../_landing/theme";
import { categories, questionTypes } from "./data";
import { FeatureExplorer } from "./explorer";
import { FeatureMarquee } from "./marquee";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Everything Examinus does: quizzes and exams for every subject, online or on paper, nine question types, anti-cheating, automatic grading, a class record with attendance, and reports.",
};

const featureCount = categories.reduce((n, cat) => n + cat.features.length, 0);

export default async function FeaturesPage() {
  const session = await callApi((api) => api["auth.session"](), forwardedHeaders(await headers()));
  const home = Result.isSuccess(session) ? homeFor(session.success.user.role) : null;
  const cta = home ? { href: home, label: "Open Examinus" } : { href: "/login", label: "Sign in" };

  return (
    <div id="top" className={`${c.bg} ${c.text} min-h-full antialiased`}>
      <SiteHeader cta={cta} signedIn={home !== null} />

      <main className="overflow-x-clip">
        <section className="relative isolate pt-14 pb-16 lg:pt-20">
          <Backdrop
            photo="1498243691581-b145c3f54a5a"
            className="inset-x-0 -top-24 h-[620px]"
            shade="bg-[#0b1326]/75"
            mask="linear-gradient(to bottom, black 0%, black 30%, transparent 100%)"
          />
          <div className="mx-auto max-w-7xl px-4 lg:px-10">
            <Eyebrow tone={c.green}>Features</Eyebrow>
            <h1 className="mt-3 max-w-3xl font-display text-[36px] leading-tight font-extrabold tracking-tight sm:text-[56px]">
              Everything Examinus does,{" "}
              <span className="bg-gradient-to-r from-[#c0c1ff] via-[#d0bcff] to-[#4edea3] bg-clip-text text-transparent">in one place</span>
            </h1>
            <p className={`mt-5 max-w-2xl text-lg leading-relaxed ${c.muted}`}>
              From writing the first question to printing the grade sheet, for every subject. Filter by who uses it, or search for
              what you need.
            </p>
            <dl className="mt-10 flex flex-wrap gap-3">
              {[
                [String(featureCount), "features"],
                [String(questionTypes.length), "question types"],
                ["5", "subject presets"],
                ["3", "roles: admin, teacher, student"],
              ].map(([n, label]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-[#0b1326]/60 px-4 py-3 backdrop-blur">
                  <dt className="sr-only">{label}</dt>
                  <dd className="flex items-baseline gap-2">
                    <span className="font-display text-2xl font-bold text-white">{n}</span>
                    <span className={`text-sm ${c.muted}`}>{label}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="mt-14">
            <FeatureMarquee />
          </div>
        </section>

        <section className="px-4 pb-24 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <FeatureExplorer />
          </div>
        </section>

        <section className="px-4 pb-24 lg:px-10">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 rounded-3xl border border-white/10 bg-gradient-to-r from-[#1b2338] to-[#11192c] p-8 sm:flex-row sm:items-center lg:p-10">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">See it with your own class</h2>
              <p className={`mt-2 ${c.muted}`}>Sign in, or create an account with Google or any email.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={cta.href}
                className="inline-flex items-center gap-2 rounded-xl bg-[#c0c1ff] px-6 py-3 text-sm font-bold text-[#1000a9] hover:bg-[#e1e0ff]"
              >
                {cta.label} <ArrowRight className="size-4" aria-hidden />
              </Link>
              {!home && (
                <Link href="/register" className="inline-flex items-center rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold hover:bg-white/[0.06]">
                  Create an account
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter cta={cta} signedIn={home !== null} />
    </div>
  );
}
