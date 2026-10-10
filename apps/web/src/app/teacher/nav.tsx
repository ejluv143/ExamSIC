"use client";

import { BookOpenCheck, CalendarClock, ClipboardList, Database, FileBarChart, KeyRound, LayoutDashboard, Users } from "lucide-react";
import { SideNav, type NavItem } from "@/components/side-nav";

const items: NavItem[] = [
  { href: "/teacher", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/teacher/classes", label: "Classes", icon: Users },
  { href: "/teacher/assessments", label: "Quizzes & exams", icon: ClipboardList },
  { href: "/teacher/sessions", label: "Sessions", icon: CalendarClock },
  { href: "/teacher/question-bank", label: "Question bank", icon: Database },
  { href: "/teacher/grading", label: "Grading", icon: BookOpenCheck },
  { href: "/teacher/reports", label: "Reports", icon: FileBarChart },
  { href: "/teacher/settings/ai", label: "AI keys", icon: KeyRound },
];

export function TeacherNav({ orientation }: { orientation: "vertical" | "horizontal" }) {
  return <SideNav items={items} orientation={orientation} />;
}
