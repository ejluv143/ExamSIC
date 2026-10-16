import type { Metadata } from "next";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { orgRoleNames } from "@examinus/domain/roles";
import { NewInviteForm, RevokeInviteButton } from "@/features/organization/components/invite-forms";
import { getAuthConfig, getInvites, getRoles } from "@/features/organization/data";
import { requirePermission } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Invite codes" };

const date = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export default async function InvitesPage() {
  const user = await requirePermission({ organization: ["update"] });
  const [invites, config] = await Promise.all([getInvites(), getAuthConfig()]);
  const custom = config.customRoles && user.organization?.permissions.ac?.includes("read") ? await getRoles() : [];
  const roleOptions = [...orgRoleNames, ...custom.map((r) => r.name)];

  return (
    <>
      <PageHeader title="Invite codes" description="Anyone with a code can join with the roles it carries, until it expires." />
      <div className="space-y-6">
        <Card>
          {invites.length === 0 ? (
            <EmptyState title="No invite codes">Create one below.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Roles</Th>
                  <Th>Expires</Th>
                  <Th>Uses</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id}>
                    <Td className="font-mono tracking-widest">{i.code}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {i.roles.map((role) => (
                          <Badge key={role} tone="primary">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </Td>
                    <Td className="text-muted">{date.format(new Date(i.expiresAt))}</Td>
                    <Td className="text-muted">{i.uses}</Td>
                    <Td>
                      <RevokeInviteButton inviteId={i.id} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="New invite code" />
          <NewInviteForm roleOptions={roleOptions} />
        </Card>
      </div>
    </>
  );
}
