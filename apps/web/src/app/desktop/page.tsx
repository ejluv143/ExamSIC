import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Result } from "effect";
import { homeFor, roleOf } from "@examinus/domain/roles";
import { callApi } from "@/lib/api/client";
import { readCurrentUser } from "@/lib/auth/dal";
import { LogoMark } from "@/components/logo";
import { ThemeMenu } from "@/components/theme-menu";
import { GuestJoinForm } from "@/features/auth/components/guest-join-form";
import { LoginForm } from "@/features/auth/components/login-form";
import { googleSignInError } from "@/features/auth/google-errors";

export const metadata: Metadata = { title: "Examinus Desktop" };

// What Examinus Desktop opens on (and where the landing page sends it): sign in, or join a game with its key. No
// marketing: the desktop app is for students taking something. Signed in, it goes straight to their area.
export default async function DesktopStartPage(props: PageProps<"/desktop">) {
  const [{ google, error, code }, user, config] = await Promise.all([
    props.searchParams,
    readCurrentUser(),
    callApi((api) => api["auth.config"](), {}),
  ]);
  if (user && user.role !== "guest") redirect(homeFor(roleOf(user)));
  const googleEnabled = Result.isSuccess(config) && config.success.google;
  return (
    <div className="relative isolate flex min-h-screen flex-1 flex-col bg-background text-foreground">
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="bg-dots absolute inset-0 [mask-image:radial-gradient(ellipse_80%_70%_at_50%_0%,black,transparent)]" />
      </div>
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4">
        <span className="mr-auto flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
          <LogoMark className="size-8" />
          Examinus
        </span>
        <ThemeMenu placement="header" />
      </header>
      <main className="mx-auto grid w-full max-w-5xl flex-1 content-center gap-8 px-4 py-10 lg:grid-cols-2 lg:gap-12">
        <section className="rounded-3xl border border-border bg-surface p-7 shadow-2xl shadow-black/10 sm:p-9">
          <h1 className="font-display text-2xl font-bold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Your school account opens your quizzes and exams.</p>
          <LoginForm next="/student" googleEnabled={googleEnabled} googleError={google === "failed" ? googleSignInError(error) : null} notice={null} />
        </section>
        <section className="flex flex-col items-center justify-center gap-4 text-center lg:items-start lg:text-left">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight">Join with a key</h2>
            <p className="mt-1 text-sm text-muted">Enter the 7-character key your teacher shows and the name to play under. No account needed for a game.</p>
          </div>
          <GuestJoinForm initialCode={typeof code === "string" ? code : ""} initialName={user?.name ?? ""} />
        </section>
      </main>
    </div>
  );
}
