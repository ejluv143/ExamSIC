import type { Metadata } from "next";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { statements } from "@examinus/domain/permissions";
import { NewRoleForm, RoleEditor } from "@/features/organization/components/role-forms";
import { getAuthConfig, getRoles } from "@/features/organization/data";
import { requirePermission } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Roles" };

export default async function RolesPage() {
  await requirePermission({ ac: ["read"] });
  const { customRoles } = await getAuthConfig();
  if (!customRoles) {
    return (
      <>
        <PageHeader title="Roles" />
        <p className="text-sm text-muted">Custom roles are not turned on for this deployment.</p>
      </>
    );
  }
  const roles = await getRoles();

  return (
    <>
      <PageHeader
        title="Roles"
        description="Roles of your own, on top of owner, admin, teacher and student. Tick what each may do."
      />
      <div className="space-y-6">
        {roles.map((role) => (
          <Card key={role.id}>
            <RoleEditor roleId={role.id} name={role.name} statements={statements} granted={role.permissions} />
          </Card>
        ))}
        <Card>
          <CardHeader title="New role" />
          <NewRoleForm statements={statements} />
        </Card>
      </div>
    </>
  );
}
