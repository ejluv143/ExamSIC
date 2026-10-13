import { AppShell } from "@/components/app-shell";
import { StudentNav } from "@/components/nav/student-nav";

export default function StudentLayout({ children }: LayoutProps<"/student">) {
  return (
    <AppShell home="/student" nav={<StudentNav />}>
      {children}
    </AppShell>
  );
}
