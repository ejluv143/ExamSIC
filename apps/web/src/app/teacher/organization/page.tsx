import type { Metadata } from "next";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { DeleteOrganizationForm, RenameForm } from "@/features/organization/components/settings-forms";
import { requirePermission } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Organization" };

export default async function OrganizationSettingsPage() {
  const user = await requirePermission({ organization: ["update"] });
  const organization = user.organization;
  if (!organization) return null;

  return (
    <>
      <PageHeader
        title={organization.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{organization.slug}</span>
            <span aria-hidden>·</span>
            <span>Your roles:</span>
            {organization.roles.map((role) => (
              <Badge key={role} tone="primary">
                {role}
              </Badge>
            ))}
          </span>
        }
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Settings" />
          <div className="p-5">
            <RenameForm name={organization.name} />
          </div>
        </Card>
        {organization.roles.includes("owner") && (
          <Card className="border-danger/40">
            <CardHeader
              title="Delete organization"
              description="Deletes the organization with its classes, quizzes and keys. Members lose access. This can't be undone."
            />
            <div className="p-5">
              <DeleteOrganizationForm name={organization.name} />
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
