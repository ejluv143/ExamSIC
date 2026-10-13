"use client";

import { CalendarDays, ClipboardList, GraduationCap, LayoutDashboard, ListChecks, Smile, Users } from "lucide-react";
import { SideNav, type NavItem } from "@/components/side-nav";

const items: NavItem[] = [
  { href: "/student", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/student/assessments", label: "Quizzes & exams", icon: ClipboardList },
  { href: "/student/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/student/standing", label: "Standing", icon: GraduationCap },
  { href: "/student/scores", label: "Scores", icon: ListChecks },
  { href: "/student/classes", label: "Classes", icon: Users },
  { href: "/student/avatar", label: "Avatar", icon: Smile },
];

export function StudentNav() {
  return <SideNav items={items} />;
}
