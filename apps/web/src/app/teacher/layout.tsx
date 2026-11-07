import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth/dal";
import { getClasses } from "@/features/classes/data";
import { TeacherNav } from "@/components/nav/teacher-nav";

export default async function TeacherLayout({ children }: LayoutProps<"/teacher">) {
  const [user, classes] = await Promise.all([getCurrentUser(), getClasses()]);
  return (
    <AppShell home="/teacher" nav={(
        <TeacherNav
          inOrganization={user.organization !== null}
          classes={classes.map((c) => ({
            href: `/teacher/classes/${c.id}`,
            label: c.title,
            detail: c.section,
            monogram: { id: c.id, courseCode: c.courseCode, color: c.color },
          }))}
        />
      )}>
      {children}
    </AppShell>
  );
}
