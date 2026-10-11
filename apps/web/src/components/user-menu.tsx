import { logout } from "@/app/login/actions";
import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentUser } from "@/lib/auth/dal";

function SignOut() {
  return (
    <form action={logout}>
      <SignOutButton />
    </form>
  );
}

export async function UserMenu() {
  const user = await getCurrentUser();
  const initials = user.name
    .replace(/^(Prof|Dr|Mr|Ms|Mrs)\.?\s+/i, "")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3 rail:flex-col rail:gap-2 rail:border-0 rail:p-0">
      <span
        title={`${user.name} · ${user.email}`}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary"
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1 rail:sr-only">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted">{user.email}</p>
      </div>
      <SignOut />
    </div>
  );
}
