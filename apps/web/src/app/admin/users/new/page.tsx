import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/dal";
import { getRoster } from "@/lib/data/admin";
import { AccountForm } from "../../account-form";
import { createAccount } from "../../actions";

export const metadata: Metadata = { title: "Add user" };

export default async function NewUserPage() {
  await requirePermission({ user: ["create", "set-role"] });
  const roster = await getRoster();

  return (
    <>
      <PageHeader back={{ href: "/admin", label: "Users" }} title="Add user" />
      <Card className="max-w-xl p-6">
        <AccountForm
          mode="create"
          action={createAccount}
          roster={roster}
          initial={{ name: "", email: "", role: "teacher", department: "", studentId: "" }}
        />
      </Card>
    </>
  );
}
