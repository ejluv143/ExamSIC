import type { Metadata } from "next";
import { LogoMark } from "@/components/logo";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BookOpenCheck, UserPlus, Zap } from "lucide-react";
import { Result } from "effect";
import { callApi } from "@/lib/api/client";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create an account" };

export default async function RegisterPage(props: PageProps<"/register">) {
  const [{ google, role }, config] = await Promise.all([
    props.searchParams,
    callApi((api) => api["auth.config"](), {}),
  ]);
  const googleEnabled = Result.isSuccess(config) && config.success.google;
  const googleResult = google === "failed" ? "failed" : null;
  return (
    <div className="relative isolate flex min-h-screen flex-1 overflow-clip bg-[#0b1326]">
      {/* Graduates throwing their caps; darkened toward the left so the headline stays readable. */}
      <Image
        src="https://images.unsplash.com/photo-1541339907198-e08756dedf3f"
        alt=""
        fill
        preload
        sizes="100vw"
        className="-z-20 object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0b1326]/95 via-[#0b1326]/75 to-[#1e1b4b]/35"
      />
      <div
        aria-hidden
        className="absolute -bottom-40 -left-40 -z-10 size-[36rem] rounded-full bg-[#8b5cf6]/20 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -top-48 -right-32 -z-10 size-[32rem] rounded-full bg-[#10b981]/10 blur-3xl"
      />

      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] 2xl:max-w-[100rem] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] 2xl:px-12 lg:gap-16 lg:py-10">
        <section className="flex flex-col text-[#dae2fd] lg:sticky lg:top-0 lg:h-[calc(100vh-5rem)] lg:justify-between">
          <div className="flex flex-col items-start gap-5">
            <Link
              href="/"
              className="group inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm font-medium text-[#dae2fd] backdrop-blur transition hover:border-white/30 hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
              Back to home
            </Link>
            <Link href="/" className="flex w-fit items-center gap-2.5 text-lg font-semibold tracking-tight text-white">
              <LogoMark className="size-10" />
              Examinus
            </Link>
          </div>

          <div className="hidden py-10 lg:block">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[#d0bcff] backdrop-blur">
              <UserPlus className="size-3.5" />
              Students and teachers
            </span>
            <h2 className="mt-6 max-w-xl text-5xl leading-[1.08] 2xl:max-w-2xl 2xl:text-6xl font-bold tracking-tight text-white">
              Your classes are{" "}
              <span className="bg-gradient-to-r from-[#d0bcff] via-[#a5b4fc] to-[#4edea3] bg-clip-text text-transparent">
                waiting for you.
              </span>
            </h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed 2xl:max-w-xl 2xl:text-lg text-[#c7c4d7]">
              Teachers start free and share a class code. Students join with it to take quizzes and exams and follow
              their standing in every subject.
            </p>

            <ol className="mt-10 max-w-md space-y-3 2xl:max-w-lg [@media(max-height:720px)]:hidden">
              {[
                { icon: UserPlus, title: "Create your account", text: "With Google or any email, in under a minute." },
                { icon: Zap, title: "Start right away", text: "No waiting: you're signed in as soon as you sign up." },
                { icon: BookOpenCheck, title: "Create or join a class", text: "Teachers share a class code; students enter it." },
              ].map((step, i) => (
                <li
                  key={step.title}
                  className="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#131b2e]/70 p-4 backdrop-blur-md"
                >
                  <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white shadow-lg shadow-[#6366f1]/30">
                    <step.icon className="size-5" aria-hidden />
                    <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-[#0b1326] text-[10px] font-bold text-[#c0c1ff] ring-1 ring-white/15">
                      {i + 1}
                    </span>
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{step.title}</p>
                    <p className="text-xs text-[#c7c4d7]">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <p className="hidden text-xs text-[#c7c4d7]/70 lg:block">Photo from Unsplash</p>
        </section>

        <section className="flex items-start justify-center pb-8 lg:items-center lg:pb-0">
          <div className="w-full max-w-md rounded-3xl 2xl:max-w-lg border border-white/10 bg-surface/95 p-7 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-9">
            <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
            <p className="mt-1 text-sm text-muted">Use Google or any email. You&apos;re in right away.</p>
            <RegisterForm
              googleEnabled={googleEnabled}
              googleResult={googleResult}
              initialRole={role === "teacher" ? "teacher" : "student"}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
