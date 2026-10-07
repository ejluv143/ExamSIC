import { AppShell } from "@/components/app-shell";
import { TeacherNav } from "./nav";

export default function TeacherLayout({ children }: LayoutProps<"/teacher">) {
  return (
    <AppShell
      home="/teacher"
      sideNav={<TeacherNav orientation="vertical" />}
      topNav={<TeacherNav orientation="horizontal" />}
    >
      {children}
    </AppShell>
  );
}
