import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/dal";
import { OrgSwitcherMenu } from "@/components/org-switcher-menu";

async function Switcher() {
  const user = await getCurrentUser();
  // Platform admins and guests have no organization.
  if (!user.organization) return null;
  return <OrgSwitcherMenu name={user.organization.name} activeId={user.organization.id} memberships={user.memberships} />;
}

// The active organization's name, and a menu to switch to another one or manage them.
export function OrgSwitcher() {
  return (
    <Suspense>
      <Switcher />
    </Suspense>
  );
}
