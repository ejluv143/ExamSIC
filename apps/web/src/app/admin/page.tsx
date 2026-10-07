import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { roleNames, type Role } from "@/lib/auth/roles";
import { getRoster, listUsers } from "@/lib/data/admin";
import { RoleBadge } from "./role-badge";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsersPage() {
  const [accounts, roster] = await Promise.all([listUsers(), getRoster()]);
  const rosterLabel = new Map(roster.map((r) => [r.id, r.label]));
  const count = (role: Role) => {
    const n = accounts.filter((a) => a.role === role).length;
    return `${n} ${role}${n === 1 ? "" : "s"}`;
  };

  return (
    <>
      <PageHeader
        title="Users"
        description={roleNames.map(count).join(" · ")}
        actions={<ButtonLink href="/admin/users/new">Add user</ButtonLink>}
      />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Department or roster entry</Th>
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
                <Td className="text-muted">
                  {a.department ?? (a.studentId ? (rosterLabel.get(a.studentId) ?? a.studentId) : "—")}
                </Td>
                <Td>{a.banned ? <Badge tone="danger">Suspended</Badge> : <Badge tone="success">Active</Badge>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
