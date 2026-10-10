import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { LogoMark } from "@/components/logo";
import { NavDrawer } from "@/components/nav-drawer";
import { SessionWatch } from "@/components/session-watch";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { ThemeMenu } from "@/components/theme-menu";
import { UserMenu } from "@/components/user-menu";

function Logo({ href }: { href: string }) {
  return (
    <Link href={href} title="Examinus" className="flex min-w-0 items-center gap-2 font-semibold tracking-tight">
      <LogoMark className="size-8 shrink-0" />
      <span className="rail:sr-only">Examinus</span>
    </Link>
  );
}

const userMenuFallback = <div className="h-[62px] rounded-lg border border-border" />;

// Large screens: a sidebar that collapses to icons (`data-rail`, see the `rail:` variant in globals.css). Small
// screens: a top bar whose menu button opens the same navigation in a drawer.
export function AppShell({ home, nav, children }: { home: string; nav: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1">
      <Suspense>
        <SessionWatch />
      </Suspense>
      <aside
        data-rail
        className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface p-4 transition-[width] duration-200 lg:flex rail:w-[4.5rem] rail:px-3 print:hidden"
      >
        <div className="flex items-center justify-between gap-2 px-2 py-1 rail:flex-col rail:px-0">
          <Logo href={home} />
          <SidebarToggle />
        </div>
        <div className="mt-6 flex-1 overflow-y-auto">{nav}</div>
        <div className="mt-4 space-y-2">
          <ThemeMenu />
          <Suspense fallback={userMenuFallback}>
            <UserMenu />
          </Suspense>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:hidden print:hidden">
          <Logo href={home} />
          <NavDrawer>
            <div className="flex-1">{nav}</div>
            <ThemeMenu />
            <Suspense fallback={userMenuFallback}>
              <UserMenu />
            </Suspense>
          </NavDrawer>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:max-w-none print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
