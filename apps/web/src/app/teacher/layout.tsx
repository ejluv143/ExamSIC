import Link from "next/link";
import { Suspense } from "react";
import { TeacherNav } from "./nav";
import { MobileSignOut, UserMenu } from "./user-menu";

function Logo() {
  return (
    <Link href="/teacher" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
        E
      </span>
      Examora
    </Link>
  );
}

export default function TeacherLayout({ children }: LayoutProps<"/teacher">) {
  return (
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface p-4 lg:flex">
        <div className="px-2 py-1">
          <Logo />
        </div>
        <div className="mt-6 flex-1">
          <TeacherNav orientation="vertical" />
        </div>
        <Suspense fallback={<div className="h-[62px] rounded-lg border border-border" />}>
          <UserMenu />
        </Suspense>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between">
            <Logo />
            <MobileSignOut />
          </div>
          <div className="mt-3 -mx-1">
            <TeacherNav orientation="horizontal" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
