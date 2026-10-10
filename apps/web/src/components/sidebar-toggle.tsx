"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { isSidebarCollapsed, setSidebarCollapsed } from "@/lib/theme";

// Collapses the desktop sidebar to icons, or expands it again; remembered in this browser. Both icons are rendered
// and CSS shows the right one, so the server's HTML matches whatever the boot script chose.
export function SidebarToggle() {
  return (
    <button
      type="button"
      onClick={() => setSidebarCollapsed(!isSidebarCollapsed())}
      title="Collapse or expand the sidebar"
      aria-label="Collapse or expand the sidebar"
      className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
    >
      <PanelLeftClose className="size-4 rail:hidden" aria-hidden />
      <PanelLeftOpen className="hidden size-4 rail:block" aria-hidden />
    </button>
  );
}
