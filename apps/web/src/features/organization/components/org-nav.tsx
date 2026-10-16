"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { segmentClass, segmentGroupClass } from "@/components/ui";

const base = "/teacher/organization";

export function OrgNav({ customRoles }: { customRoles: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: base, label: "Settings", exact: true },
    { href: `${base}/members`, label: "Members" },
    { href: `${base}/invites`, label: "Invite codes" },
    ...(customRoles ? [{ href: `${base}/roles`, label: "Roles" }] : []),
    { href: `${base}/ai`, label: "AI keys" },
  ];
  return (
    <nav aria-label="Organization" className={`${segmentGroupClass} mb-6`}>
      {items.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={segmentClass(active)}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
