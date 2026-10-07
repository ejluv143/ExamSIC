import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/dal";
import { getAccount, getRoster } from "@/lib/data/admin";
import { AccountForm } from "../../account-form";
import { updateAccount } from "../../actions";
import { RoleBadge } from "../../role-badge";
import { PasswordForm, RemoveForm, SuspendForm } from "./account-actions";

export const metadata: Metadata = { title: "Edit user" };

export default async function EditUserPage(props: PageProps<"/admin/users/[userId]">) {
  const me = await requirePermission({ user: ["update", "set-role"] });
  const { userId } = await props.params;
  const [account, roster] = await Promise.all([getAccount(userId), getRoster()]);
  if (!account) notFound();
  const self = account.id === me.id;

  return (
    <>
      <PageHeader
        back={{ href: "/admin", label: "Users" }}
        title={account.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {account.email} <RoleBadge role={account.role} />
            {account.pending ? (
              <Badge tone="warning">Pending approval</Badge>
            ) : (
              account.banned && <Badge tone="danger">Suspended</Badge>
            )}
            {self && <Badge>You</Badge>}
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card>
          <CardHeader title="Account" />
          <div className="p-5">
            <AccountForm
              mode="edit"
              action={updateAccount.bind(null, account.id)}
              roster={roster}
              roleLocked={self}
              initial={{
                name: account.name,
                email: account.email,
                role: account.role,
                department: account.department ?? "",
                studentId: account.studentId ?? "",
              }}
            />
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Password" />
            <div className="p-5">
              <PasswordForm userId={account.id} />
            </div>
          </Card>
          {!self && (
            <>
              <Card>
                <CardHeader title="Access" />
                <div className="p-5">
                  <SuspendForm userId={account.id} suspended={account.banned} pending={account.pending} />
                </div>
              </Card>
              <Card>
                <CardHeader title="Remove" />
                <div className="p-5">
                  <RemoveForm userId={account.id} name={account.name} />
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
