import type { Metadata } from "next";
import { LogoMark } from "@/components/logo";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Radio, Sparkles } from "lucide-react";
import { Result } from "effect";
import { callApi } from "@/lib/api/client";
import { googleSignInError } from "./google-errors";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const [{ next, google, error }, config] = await Promise.all([
    props.searchParams,
    callApi((api) => api["auth.config"](), {}),
  ]);
  const googleEnabled = Result.isSuccess(config) && config.success.google;
  return (
    <div className="relative isolate flex min-h-screen flex-1 overflow-hidden bg-[#0b1326]">
      {/* A student walking down a library aisle, darkened toward the left so the headline stays readable. */}
      <Image
        src="https://images.unsplash.com/photo-1427504494785-3a9ca7044f45"
        alt=""
        fill
        preload
        sizes="100vw"
        className="-z-20 object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0b1326]/95 via-[#0b1326]/70 to-[#1e1b4b]/30"
      />
      <div
        aria-hidden
        className="absolute -top-40 -left-40 -z-10 size-[36rem] rounded-full bg-[#6366f1]/20 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -right-32 -bottom-48 -z-10 size-[32rem] rounded-full bg-[#06b6d4]/10 blur-3xl"
      />

      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:items-center lg:gap-16 lg:py-10">
        <section className="flex flex-col text-[#dae2fd] lg:min-h-[calc(100vh-5rem)] lg:justify-between">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex w-fit items-center gap-2.5 text-lg font-semibold tracking-tight text-white">
              <LogoMark className="size-10" />
              Examora
            </Link>
            <Link
              href="/"
              className="group inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm font-medium text-[#dae2fd] backdrop-blur transition hover:border-white/30 hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
              Back to home
            </Link>
          </div>

          <div className="hidden py-12 lg:block">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[#c0c1ff] backdrop-blur">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full rounded-full bg-[#4edea3] opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-[#4edea3]" />
              </span>
              For teachers and students
            </span>
            <h2 className="mt-6 max-w-xl text-5xl leading-[1.08] font-bold tracking-tight text-white">
              Every quiz, exam and grade,{" "}
              <span className="bg-gradient-to-r from-[#a5b4fc] via-[#818cf8] to-[#38bdf8] bg-clip-text text-transparent">
                in one place.
              </span>
            </h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-[#c7c4d7]">
              Run live quizzes for a whole lecture hall, give timed exams that grade themselves, and watch the class
              record fill in as students submit.
            </p>

            <div className="relative mt-12 h-48 max-w-xl">
              <div className="absolute top-0 left-0 w-72 rounded-2xl border border-white/10 bg-[#131b2e]/80 p-4 shadow-2xl backdrop-blur-md motion-safe:animate-float">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-[#4edea3]">
                    <Radio className="size-3.5" /> Live quiz
                  </span>
                  <span className="text-[#c7c4d7]">BSIT 2A</span>
                </div>
                <p className="mt-2 text-sm font-medium text-white">Data Structures · Quiz 3</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-[84%] rounded-full bg-gradient-to-r from-[#6366f1] to-[#38bdf8]" />
                </div>
                <p className="mt-1.5 text-xs text-[#c7c4d7]">38 of 45 students answered</p>
              </div>
              <div
                className="absolute top-16 left-64 w-60 rounded-2xl border border-white/10 bg-[#131b2e]/80 p-4 shadow-2xl backdrop-blur-md motion-safe:animate-float"
                style={{ animationDelay: "-3s" }}
              >
                <p className="flex items-center gap-1.5 text-xs font-semibold text-[#d0bcff]">
                  <Sparkles className="size-3.5" /> Midterm exam
                </p>
                <p className="mt-2 text-3xl font-bold text-white tabular-nums">
                  87<span className="text-base font-medium text-[#c7c4d7]">% class average</span>
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-[#4edea3]">
                  <CheckCircle2 className="size-3.5" /> Added to the class record
                </p>
              </div>
            </div>
          </div>

          <p className="hidden text-xs text-[#c7c4d7]/70 lg:block">Photo from Unsplash</p>
        </section>

        <section className="flex items-center justify-center pb-8 lg:pb-0">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-surface/95 p-7 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-9">
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-muted">
              Sign in to Examora. New here?{" "}
              <Link href="/register?role=teacher" className="font-medium text-primary hover:underline">
                Sign up free
              </Link>
            </p>
            <LoginForm
              next={typeof next === "string" ? next : ""}
              googleEnabled={googleEnabled}
              googleError={google === "failed" ? googleSignInError(error) : null}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
