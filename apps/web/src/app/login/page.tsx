import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Radio, Sparkles } from "lucide-react";
import { Result } from "effect";
import { callApi } from "@/lib/api/client";
import { AuthShell, ShowcaseCard } from "@/features/auth/components/auth-shell";
import { googleSignInError } from "@/features/auth/google-errors";
import { LoginForm } from "@/features/auth/components/login-form";
import { oauthResumeUrl } from "@/features/auth/oauth";

export const metadata: Metadata = { title: "Sign in" };

// Why an open page sent them here (features/auth/components/session-watch.tsx).
const signedOutNotice: Record<string, string> = {
  idle: "You were signed out because you weren't active for 30 minutes. Sign in again to continue.",
  expired: "Your session ended. Sign in again to continue.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const [searchParams, config] = await Promise.all([props.searchParams, callApi((api) => api["auth.config"](), {})]);
  const { next, google, error, signedOut } = searchParams;
  const googleEnabled = Result.isSuccess(config) && config.success.google;
  return (
    <AuthShell
      eyebrow="Welcome back"
      headline="Every quiz, exam and grade,"
      highlight="in one place."
      lead="Run live quizzes for a whole lecture hall, give timed exams that grade themselves, and watch the class record fill in as students submit."
      showcase={<LoginShowcase />}
    >
      <h1 className="font-display text-2xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-muted">
        New here?{" "}
        <Link href="/register?role=teacher" className="font-medium text-primary hover:underline">
          Start free
        </Link>
      </p>
      <LoginForm
        next={oauthResumeUrl(searchParams) ?? (typeof next === "string" ? next : "")}
        googleEnabled={googleEnabled}
        googleError={google === "failed" ? googleSignInError(error) : null}
        notice={signedOutNotice[String(signedOut)] ?? null}
      />
    </AuthShell>
  );
}

// A live quiz in progress and an exam landing in the class record, drawn like the landing page's cards.
function LoginShowcase() {
  return (
    <div className="relative h-52 max-w-xl">
      <ShowcaseCard className="absolute top-0 left-0 w-72">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold text-success">
            <Radio className="size-3.5" /> Live quiz
          </span>
          <span className="text-muted">BSIT 2-A</span>
        </div>
        <p className="mt-2 text-sm font-semibold">Data Structures · Quiz 3</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full w-[84%] rounded-full bg-primary" />
        </div>
        <p className="mt-1.5 text-muted">38 of 45 students answered</p>
      </ShowcaseCard>
      <ShowcaseCard className="absolute top-20 left-64 w-64" delay={3}>
        <p className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 font-semibold text-primary">
          <Sparkles className="size-3" /> Midterm exam
        </p>
        <p className="mt-2 font-display text-3xl font-bold tabular-nums">
          87<span className="text-sm font-medium text-muted">% class average</span>
        </p>
        <p className="mt-2 flex items-center gap-1.5 font-medium text-success">
          <CheckCircle2 className="size-3.5" /> Added to the class record
        </p>
      </ShowcaseCard>
    </div>
  );
}
