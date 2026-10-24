import type { Metadata } from "next";
import { BookOpenCheck, UserPlus, Zap } from "lucide-react";
import { Result } from "effect";
import { callApi } from "@/lib/api/client";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { RegisterForm } from "@/features/auth/components/register-form";

export const metadata: Metadata = { title: "Create an account" };

const steps = [
  { icon: UserPlus, title: "Create your account", text: "With Google or any email, in under a minute." },
  { icon: Zap, title: "Start right away", text: "No waiting: you're signed in to your personal space as soon as you sign up." },
  { icon: BookOpenCheck, title: "Create or join a class", text: "Teachers share a class code; students enter it." },
];

export default async function RegisterPage(props: PageProps<"/register">) {
  const [{ google, role }, config] = await Promise.all([
    props.searchParams,
    callApi((api) => api["auth.config"](), {}),
  ]);
  const googleEnabled = Result.isSuccess(config) && config.success.google;
  const googleResult = google === "failed" ? "failed" : null;
  return (
    <AuthShell
      eyebrow="Students and teachers"
      headline="Your classes are"
      highlight="waiting for you."
      lead="Teachers and students both start in a personal space. Teachers share a class code; students join with it to take quizzes and exams and follow their standing in every subject. Create or join an organization later if your school uses one."
      showcase={
        // The three steps, joined by a line like the landing page's "How it works".
        <ol className="relative max-w-md space-y-4">
          <span aria-hidden className="absolute top-6 bottom-6 left-6 w-px bg-[linear-gradient(var(--primary),var(--border))]" />
          {steps.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="relative flex items-center gap-4">
              <span
                className={`grid size-12 shrink-0 place-items-center rounded-2xl ring-8 ring-background ${i === 0 ? "bg-primary text-primary-foreground" : "border border-border bg-surface text-primary"}`}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block text-xs font-semibold tracking-wider text-muted uppercase">Step {i + 1}</span>
                <span className="block font-display font-semibold">{title}</span>
                <span className="block text-sm text-muted">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      }
    >
      <h1 className="font-display text-2xl font-bold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-muted">Use Google or any email. You&apos;re in right away.</p>
      <RegisterForm
        googleEnabled={googleEnabled}
        googleResult={googleResult}
        initialRole={role === "teacher" ? "teacher" : "student"}
      />
    </AuthShell>
  );
}
