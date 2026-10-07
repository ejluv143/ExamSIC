import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";
import { getCurrentUser } from "@/lib/auth/dal";

function SignOut({ compact }: { compact?: boolean }) {
  return (
    <form action={logout}>
      <button
        type="submit"
        title="Sign out"
        aria-label="Sign out"
        className="inline-flex items-center gap-2 rounded-lg p-2 text-sm text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
      >
        <LogOut className="size-4" aria-hidden />
        {!compact && "Sign out"}
      </button>
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
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted">{user.email}</p>
      </div>
      <SignOut compact />
    </div>
  );
}

// For the small-screen header, where there is no sidebar.
export function MobileSignOut() {
  return <SignOut />;
}
