import Link from "next/link";
import clsx from "clsx";
import { DoorOpen } from "lucide-react";

// The second call to action: students with a room key go straight in, no account needed. `inverse` is for a panel
// filled with the accent colour.
export function EnterRoomLink({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link
      href="/join"
      className={clsx(
        "inline-flex h-12 items-center justify-center gap-2 rounded-full border px-6 text-sm font-semibold transition hover:-translate-y-0.5",
        inverse
          ? "border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10"
          : "border-border bg-surface/80 backdrop-blur hover:bg-surface-muted",
      )}
    >
      <DoorOpen className="size-4" aria-hidden />
      Enter a room
    </Link>
  );
}
