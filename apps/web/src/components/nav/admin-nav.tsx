"use client";

import { UserPlus, Users } from "lucide-react";
import { SideNav, type NavItem } from "@/components/side-nav";

const items: NavItem[] = [
  { href: "/admin", label: "Users", icon: Users, exact: true },
  { href: "/admin/users/new", label: "Add user", icon: UserPlus },
];

export function AdminNav() {
  return <SideNav items={items} />;
}
