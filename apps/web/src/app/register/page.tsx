import type { Metadata } from "next";
import { Result } from "effect";
import { callApi } from "@/lib/api/client";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create an account" };

export default async function RegisterPage(props: PageProps<"/register">) {
  const [{ google, error }, config] = await Promise.all([
    props.searchParams,
    callApi((api) => api["auth.config"](), {}),
  ]);
  const googleEnabled = Result.isSuccess(config) && config.success.google;
  // A Google sign-up ends on the error URL: the new account exists but is banned until approved.
  const googleResult = google === "failed" ? (error === "BANNED_USER" ? "pending" : "failed") : null;
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
          <h2 className="text-3xl font-semibold tracking-tight">Join your classes on Examora.</h2>
          <p className="mt-3 text-primary-foreground/80">
            Create your account, and an administrator approves it. Then take your quizzes and exams, and see your
            standing in every subject.
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
          <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
          <p className="mt-1 text-sm text-muted">Use Google or any email. An administrator approves new accounts.</p>
          <RegisterForm googleEnabled={googleEnabled} googleResult={googleResult} />
        </div>
      </section>
    </div>
  );
}
