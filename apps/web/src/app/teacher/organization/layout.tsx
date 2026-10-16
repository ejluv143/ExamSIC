import { OrgNav } from "@/features/organization/components/org-nav";
import { getAuthConfig } from "@/features/organization/data";

export default async function OrganizationLayout({ children }: LayoutProps<"/teacher/organization">) {
  const { customRoles } = await getAuthConfig();
  return (
    <>
      <OrgNav customRoles={customRoles} />
      {children}
    </>
  );
}
