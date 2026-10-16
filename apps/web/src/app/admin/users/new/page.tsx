import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/dal";
import { AccountForm } from "@/features/admin/components/account-form";
import { createAccount } from "@/features/admin/actions";

export const metadata: Metadata = { title: "Add user" };

export default async function NewUserPage() {
  await requirePermission({ user: ["create", "set-role"] });

  return (
    <>
      <PageHeader back={{ href: "/admin", label: "Users" }} title="Add user" />
      <Card className="max-w-xl p-6">
        <AccountForm
          mode="create"
          action={createAccount}
          initial={{ name: "", email: "", role: "user", department: "" }}
        />
      </Card>
    </>
  );
}
