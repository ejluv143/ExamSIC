import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/logo";
import { ButtonLink } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/dal";
import { OrganizationPicker } from "@/features/auth/components/organization-picker";

export const metadata: Metadata = { title: "Organizations" };

// Where people choose, create or join the organization they work in. Platform admins have none: they run the platform.
export default async function OrganizationsPage() {
  const user = await getCurrentUser();
  if (user.role === "guest") redirect("/join");
  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <LogoMark className="size-8" />
        Examinus
      </Link>
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Organizations</h1>
        <p className="mt-1 text-sm text-muted">
          {user.role === "admin"
            ? "Platform admins don't belong to an organization."
            : "Organizations are optional. Work in your personal space, or choose, create or join an organization."}
        </p>
      </div>
      {user.role === "admin" ? (
        <ButtonLink href="/admin">Go to the admin area</ButtonLink>
      ) : (
        <OrganizationPicker memberships={user.memberships} activeId={user.organization?.id ?? null} />
      )}
    </div>
  );
}
