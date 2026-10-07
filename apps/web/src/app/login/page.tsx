import type { Metadata } from "next";
import { googleEnabled } from "@/lib/auth/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { next, error } = await props.searchParams;
  return (
    <div className="grid min-h-full flex-1 lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="grid size-9 place-items-center rounded-lg bg-primary-foreground text-base font-bold text-primary">
            E
          </span>
          Examora
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold tracking-tight">Quizzes and exams, online or on paper.</h2>
          <p className="mt-3 text-primary-foreground/80">
            Build once from your question bank, assign to your Google Classroom classes, and print a ready-to-copy
            test paper with your school&apos;s header.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/70">San Isidro College · School of Information Technology</p>
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 text-lg font-semibold tracking-tight lg:hidden">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-base font-bold text-primary-foreground">
              E
            </span>
            Examora
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Use your school account.</p>
          <LoginForm
            next={typeof next === "string" ? next : ""}
            googleEnabled={googleEnabled}
            googleFailed={error === "google"}
          />
        </div>
      </section>
    </div>
  );
}
