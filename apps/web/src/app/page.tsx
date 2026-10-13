import type { Metadata } from "next";
import { AnalyticsShowcase } from "@/components/landing/showcase";
import { EnterRoomLink } from "@/components/landing/enter-room-link";
import { Faq } from "@/components/landing/faq";
import { FeatureCards } from "@/components/landing/feature-cards";
import { Hero } from "@/components/landing/hero";
import { QuestionTypeMarquee } from "@/components/landing/marquee";
import { Pricing } from "@/components/landing/pricing";
import { ScrollEffects } from "@/components/landing/scroll-effects";
import { SectionHeading } from "@/components/landing/section-heading";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { StartLink } from "@/components/landing/start-link";
import { Steps } from "@/components/landing/steps";

export const metadata: Metadata = {
  title: { absolute: "Examinus · Quizzes, exams and class records" },
  description: "Online and printed quizzes and exams for college, graded automatically, with anti-cheating and a class record that fills itself in.",
};

// Built once at build time; the signed-in parts (header and start button) are filled in by the browser.
export const dynamic = "force-static";

export default function Landing() {
  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <ScrollEffects />
      {/* How far down the page the visitor is, along the header's bottom edge (globals.css: .scroll-progress). */}
      <div aria-hidden className="scroll-progress fixed inset-x-0 top-[63px] z-40 h-0.5 bg-primary" />
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <QuestionTypeMarquee />

        <section aria-labelledby="features" className="px-4 py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHeading
              id="features"
              eyebrow="Features"
              title="Everything an exam needs, in one place"
              text="From writing the questions to the grade sheet: one tool for the whole course, built around how colleges actually grade."
            />
          </div>
          <FeatureCards />
        </section>

        <AnalyticsShowcase />
        <Steps />
        <Pricing />
        <Faq />

        <section className="px-4 pb-24">
          <div
            data-reveal="zoom"
            className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-primary px-6 py-16 text-center text-primary-foreground sm:py-20"
          >
            <div aria-hidden className="bg-dots-light absolute inset-0 -z-10 opacity-30 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
            <div
              aria-hidden
              className="absolute -top-24 left-1/2 -z-10 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-[color-mix(in_oklab,white_25%,transparent)] blur-3xl"
            />
            <h2 className="mx-auto max-w-2xl font-display text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
              Your next exam could grade itself.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-lg opacity-85">Sign up with Google or any email. Your first classes are free.</p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <StartLink inverse />
              <EnterRoomLink inverse />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
