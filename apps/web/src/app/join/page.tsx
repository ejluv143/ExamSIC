import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/logo";
import { readCurrentUser } from "@/lib/auth/dal";
import { GuestJoinForm } from "./guest-join-form";

export const metadata: Metadata = { title: "Join a game" };

// Where a key or an invite link (/join?id=ABC-DEFG, also ?code=) leads. Signed-in students join from their own
// join page, which opens sessions of every mode; anyone else plays as a guest, giving only a name.
export default async function JoinPage(props: PageProps<"/join">) {
  const [{ id, code }, user] = await Promise.all([props.searchParams, readCurrentUser()]);
  const key = typeof id === "string" ? id : typeof code === "string" ? code : "";
  if (user?.role === "student") redirect(key ? `/student/join?code=${encodeURIComponent(key)}` : "/student/join");
  if (user && user.role !== "guest") redirect(`/${user.role}`);
  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <LogoMark className="size-8" />
        Examinus
      </Link>
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Join a game</h1>
        <p className="mt-1 text-sm text-muted">Enter the key your teacher shows and the name to play under. No account needed.</p>
      </div>
      <GuestJoinForm initialCode={key} initialName={user?.name ?? ""} />
      <p className="text-sm text-muted">
        Have an account?{" "}
        <Link href={`/login?next=${encodeURIComponent(key ? `/student/join?code=${key}` : "/student/join")}`} className="font-medium text-foreground underline">
          Sign in
        </Link>{" "}
        to join as yourself.
      </p>
    </div>
  );
}
