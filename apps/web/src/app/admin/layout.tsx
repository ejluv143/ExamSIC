import { AppShell } from "@/components/app-shell";
import { AdminNav } from "./nav";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AppShell home="/admin" nav={<AdminNav />}>
      {children}
    </AppShell>
  );
}
