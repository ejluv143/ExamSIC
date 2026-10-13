"use client";

import { KeyRound, UserPlus, Users } from "lucide-react";
import { SideNav, type NavItem } from "@/components/side-nav";

const items: NavItem[] = [
  { href: "/admin", label: "Users", icon: Users, exact: true },
  { href: "/admin/users/new", label: "Add user", icon: UserPlus },
  { href: "/admin/ai", label: "AI keys", icon: KeyRound },
];

export function AdminNav() {
  return <SideNav items={items} />;
}
