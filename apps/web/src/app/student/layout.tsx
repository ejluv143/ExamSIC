import { AppShell } from "@/components/app-shell";
import { StudentNav } from "./nav";

export default function StudentLayout({ children }: LayoutProps<"/student">) {
  return (
    <AppShell home="/student" nav={<StudentNav />}>
      {children}
    </AppShell>
  );
}
