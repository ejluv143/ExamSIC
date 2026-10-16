import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import type { PlatformRole } from "@examinus/domain/roles";
import { listUsers } from "@/features/admin/data";
import { RoleBadge } from "@/features/admin/components/role-badge";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsersPage() {
  const accounts = await listUsers();
  const count = (role: PlatformRole) => {
    const n = accounts.filter((a) => a.role === role).length;
    return `${n} ${role}${n === 1 ? "" : "s"}`;
  };

  return (
    <>
      <PageHeader
        title="Users"
        description={(["admin", "user", "guest"] as const).map(count).join(" · ")}
        actions={<ButtonLink href="/admin/users/new">Add user</ButtonLink>}
      />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Department</Th>
              <Th>Organizations</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="hover:bg-surface-muted">
                <Td>
                  <Link href={`/admin/users/${encodeURIComponent(a.id)}`} className="font-medium hover:text-primary">
                    {a.name}
                  </Link>
                  <p className="text-xs text-muted">{a.email}</p>
                </Td>
                <Td>
                  <RoleBadge role={a.role} />
                </Td>
                <Td className="text-muted">{a.department ?? "—"}</Td>
                <Td>
                  {a.memberships.length === 0 ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <ul className="space-y-0.5 text-sm">
                      {a.memberships.map((m) => (
                        <li key={m.id}>
                          <span className="font-medium">{m.name}</span>
                          <span className="text-muted">: {m.roles.join(", ")}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Td>
                <Td>
                  {a.banned ? (
                    <Badge tone="danger">Suspended</Badge>
                  ) : (
                    <Badge tone="success">Active</Badge>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
