import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { OrgNav } from "@/features/organization/components/org-nav";
import { getAuthConfig } from "@/features/organization/data";

export default async function OrganizationLayout({ children }: LayoutProps<"/teacher/organization">) {
  // These pages are organization-only; in the personal space the picker is the way in.
  const user = await getCurrentUser();
  if (!user.organization) redirect("/organizations");
  const { customRoles } = await getAuthConfig();
  return (
    <>
      <OrgNav customRoles={customRoles} />
      {children}
    </>
  );
}
