import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/dal";
import { OrgSwitcherMenu } from "@/components/org-switcher-menu";

async function Switcher() {
  const user = await getCurrentUser();
  // Only people who belong to an organization can switch; admins and guests have none.
  if (user.memberships.length === 0) return null;
  return (
    <OrgSwitcherMenu name={user.organization?.name ?? "Personal space"} activeId={user.organization?.id ?? null} memberships={user.memberships} />
  );
}

// The active organization's name (or "Personal space"), and a menu to switch to another one or manage them.
export function OrgSwitcher() {
  return (
    <Suspense>
      <Switcher />
    </Suspense>
  );
}
