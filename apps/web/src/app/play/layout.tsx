import Link from "next/link";
import { Suspense } from "react";
import { LogoMark } from "@/components/logo";
import { SessionWatch } from "@/components/session-watch";
import { Button } from "@/components/ui";
import { leaveAsGuest } from "../join/actions";

// Where guests play: no navigation, just the logo and a way out.
export default function PlayLayout({ children }: LayoutProps<"/play">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Suspense>
        <SessionWatch />
      </Suspense>
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 print:hidden">
        <Link href="/join" className="flex items-center gap-2 font-semibold tracking-tight">
          <LogoMark className="size-8" />
          Examinus
        </Link>
        <form action={leaveAsGuest}>
          <Button type="submit" variant="secondary">
            Leave
          </Button>
        </form>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
