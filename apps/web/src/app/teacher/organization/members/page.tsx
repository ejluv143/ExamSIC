import type { Metadata } from "next";
import { Badge, Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { orgRoleNames } from "@examinus/domain/roles";
import { AddMemberForm, MemberRolesForm, RemoveMemberButton } from "@/features/organization/components/member-forms";
import { getAuthConfig, getMembers, getRoles } from "@/features/organization/data";
import { requirePermission } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Members" };

const joined = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export default async function MembersPage() {
  const user = await requirePermission({ organization: ["update"] });
  const [members, config] = await Promise.all([getMembers(), getAuthConfig()]);
  const custom = config.customRoles && user.organization?.permissions.ac?.includes("read") ? await getRoles() : [];
  const roleOptions = [...orgRoleNames, ...custom.map((r) => r.name)];

  return (
    <>
      <PageHeader title="Members" description={`${members.length} in this organization`} />
      <div className="space-y-6">
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Roles</Th>
                <Th>Joined</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <Td>
                    <p className="font-medium">{m.name}</p>
                    <p className="text-xs text-muted">{m.email}</p>
                  </Td>
                  <Td>
                    <div className="mb-2 flex flex-wrap gap-1">
                      {m.roles.map((role) => (
                        <Badge key={role} tone={role === "owner" ? "warning" : "primary"}>
                          {role}
                        </Badge>
                      ))}
                    </div>
                    <MemberRolesForm memberId={m.id} roles={m.roles} roleOptions={roleOptions} />
                  </Td>
                  <Td className="text-muted">{joined.format(new Date(m.joinedAt))}</Td>
                  <Td>
                    <RemoveMemberButton memberId={m.id} name={m.name} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Add member by email" />
          <AddMemberForm roleOptions={roleOptions} />
        </Card>
      </div>
    </>
  );
}
