"use client";

import { useTransition } from "react";
import { Building2, Check, Settings2, User } from "lucide-react";
import type { Membership } from "@examinus/domain/user";
import { Menu, type MenuItem } from "@/components/menu";
import { setActiveOrganizationAction } from "@/features/auth/organizations";

export function OrgSwitcherMenu({
  name,
  activeId,
  memberships,
}: {
  name: string;
  activeId: string | null;
  memberships: readonly Membership[];
}) {
  const [pending, start] = useTransition();
  const items: MenuItem[] = [
    {
      label: "Personal space",
      icon: activeId === null ? Check : User,
      disabled: pending || activeId === null,
      onSelect: () => start(async () => void (await setActiveOrganizationAction(null))),
    },
    ...memberships.map(
      (m): MenuItem => ({
        label: m.name,
        icon: m.id === activeId ? Check : Building2,
        disabled: pending || m.id === activeId,
        onSelect: () => start(async () => void (await setActiveOrganizationAction(m.id))),
      }),
    ),
    { label: "Manage organizations", icon: Settings2, href: "/organizations" },
  ];
  return (
    <div className="mt-4 flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 rail:flex-col rail:border-0 rail:px-0">
      <Building2 className="ml-1 size-4 shrink-0 text-muted rail:hidden" aria-hidden />
      <p title={name} className="min-w-0 flex-1 truncate text-sm font-medium rail:sr-only">
        {name}
      </p>
      <Menu label={`Organization: ${name}`} items={items} align="left" />
    </div>
  );
}
