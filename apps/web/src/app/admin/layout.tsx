import { AppShell } from "@/components/app-shell";
import { AdminNav } from "@/components/nav/admin-nav";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AppShell home="/admin" nav={<AdminNav />}>
      {children}
    </AppShell>
  );
}
