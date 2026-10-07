import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { MobileSignOut, UserMenu } from "@/components/user-menu";

function Logo({ href }: { href: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
        E
      </span>
      Examora
    </Link>
  );
}

// Sidebar on large screens; on small ones a top bar with the same links scrolling sideways.
export function AppShell({
  home,
  sideNav,
  topNav,
  children,
}: {
  home: string;
  sideNav: ReactNode;
  topNav: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface p-4 lg:flex">
        <div className="px-2 py-1">
          <Logo href={home} />
        </div>
        <div className="mt-6 flex-1">{sideNav}</div>
        <Suspense fallback={<div className="h-[62px] rounded-lg border border-border" />}>
          <UserMenu />
        </Suspense>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between">
            <Logo href={home} />
            <MobileSignOut />
          </div>
          <div className="mt-3 -mx-1">{topNav}</div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
