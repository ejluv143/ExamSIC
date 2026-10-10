"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Dialog } from "@/components/dialog";

// Small screens: a menu button that slides the navigation, appearance and account in from the left. It closes
// when a link changes the page.
export function NavDrawer({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenOn(pathname)}
        aria-label="Open menu"
        className="grid size-9 place-items-center rounded-lg border border-border text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Menu className="size-5" aria-hidden />
      </button>
      <Dialog open={open} onClose={() => setOpenOn(null)} title="Menu" drawer>
        <div className="flex min-h-full flex-col gap-4">{children}</div>
      </Dialog>
    </>
  );
}
