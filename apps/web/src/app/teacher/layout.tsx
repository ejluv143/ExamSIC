import { AppShell } from "@/components/app-shell";
import { TeacherNav } from "./nav";

export default function TeacherLayout({ children }: LayoutProps<"/teacher">) {
  return (
    <AppShell home="/teacher" nav={<TeacherNav />}>
      {children}
    </AppShell>
  );
}
