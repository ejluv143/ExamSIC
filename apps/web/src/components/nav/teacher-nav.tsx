"use client";

import { Building2, BookOpenCheck, CalendarClock, ClipboardList, Database, FileBarChart, LayoutDashboard, Users } from "lucide-react";
import { SideNav, type NavItem } from "@/components/side-nav";

const items: NavItem[] = [
  { href: "/teacher", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/teacher/classes", label: "Classes", icon: Users },
  { href: "/teacher/assessments", label: "Quizzes & exams", icon: ClipboardList },
  { href: "/teacher/sessions", label: "Sessions", icon: CalendarClock },
  { href: "/teacher/question-bank", label: "Question bank", icon: Database },
  { href: "/teacher/grading", label: "Grading", icon: BookOpenCheck },
  { href: "/teacher/reports", label: "Reports", icon: FileBarChart },
];

const organizationItem: NavItem = { href: "/teacher/organization", label: "Organization", icon: Building2 };

// The organization pages only exist inside an organization; in the personal space they're hidden.
export function TeacherNav({ inOrganization }: { inOrganization: boolean }) {
  return <SideNav items={inOrganization ? [...items, organizationItem] : items} />;
}
