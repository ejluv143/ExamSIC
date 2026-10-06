"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { BookOpenCheck, ClipboardList, Database, LayoutDashboard, Users } from "lucide-react";

const items = [
  { href: "/teacher", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/teacher/classes", label: "Classes", icon: Users },
  { href: "/teacher/assessments", label: "Quizzes & exams", icon: ClipboardList },
  { href: "/teacher/question-bank", label: "Question bank", icon: Database },
  { href: "/teacher/grading", label: "Grading", icon: BookOpenCheck },
];

export function TeacherNav({ orientation }: { orientation: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  return (
    <nav
      className={clsx(
        orientation === "vertical" ? "flex flex-col gap-1" : "flex gap-1 overflow-x-auto",
      )}
    >
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-primary-soft text-primary"
                : "text-muted hover:bg-surface-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
