import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth/dal";
import { TeacherNav } from "@/components/nav/teacher-nav";

export default async function TeacherLayout({ children }: LayoutProps<"/teacher">) {
  const user = await getCurrentUser();
  return (
    <AppShell home="/teacher" nav={<TeacherNav inOrganization={user.organization !== null} />}>
      {children}
    </AppShell>
  );
}
