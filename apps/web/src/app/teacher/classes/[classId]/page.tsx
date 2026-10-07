import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, ExternalLink, Plus, Printer, Sheet } from "lucide-react";
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { ClassroomSyncButton } from "@/components/classroom-sync-button";
import { ModeBadge, StatusBadge } from "@/components/assessment-bits";
import { getClass, getStudents, listSessions } from "@/lib/data/teacher";
import { formatDateTime, fullName } from "@/lib/format";

export async function generateMetadata(
  props: PageProps<"/teacher/classes/[classId]">,
): Promise<Metadata> {
  const { classId } = await props.params;
  const cls = await getClass(classId);
  return { title: cls ? `${cls.courseCode} ${cls.section}` : "Class" };
}

export default async function ClassPage(props: PageProps<"/teacher/classes/[classId]">) {
  const { classId } = await props.params;
  const cls = await getClass(classId);
  if (!cls) notFound();

  const [students, sessions] = await Promise.all([
    getStudents(cls.studentIds),
    listSessions({ classId }),
  ]);

  return (
    <>
      <PageHeader
        back={{ href: "/teacher/classes", label: "Classes" }}
        title={`${cls.courseCode} · ${cls.title}`}
        description={`${cls.section} · ${cls.schedule} · ${cls.room}`}
        actions={
          <>
            <ButtonLink href={`/teacher/classes/${cls.id}/attendance`} variant="secondary">
              <CalendarCheck className="size-4" aria-hidden /> Attendance
            </ButtonLink>
            <ButtonLink href={`/teacher/classes/${cls.id}/record`} variant="secondary">
              <Sheet className="size-4" aria-hidden /> Class record
            </ButtonLink>
            <ButtonLink href={`/teacher/classes/${cls.id}/grade-sheet`} variant="secondary">
              <Printer className="size-4" aria-hidden /> Grade sheet
            </ButtonLink>
            <ButtonLink href={`/teacher/assessments/new?class=${cls.id}`}>
              <Plus className="size-4" aria-hidden /> New quiz
            </ButtonLink>
          </>
        }
      />

      <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="font-medium">Linked to Google Classroom</p>
          <p className="mt-0.5 text-sm text-muted">
            The roster comes from Classroom. Last synced {formatDateTime(cls.classroom.lastSyncedAt)}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ClassroomSyncButton label="Sync roster" />
          <a
            href={cls.classroom.link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium hover:bg-surface-muted"
          >
            Open in Classroom <ExternalLink className="size-4" aria-hidden />
          </a>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Students" description={`${students.length} enrolled`} />
          <Table>
            <thead>
              <tr>
                <Th>Student no.</Th>
                <Th>Name</Th>
                <Th className="hidden md:table-cell">Email</Th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <Td className="font-mono text-xs">{s.studentNumber}</Td>
                  <Td className="font-medium">{fullName(s)}</Td>
                  <Td className="hidden text-muted md:table-cell">{s.email}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card className="self-start xl:col-span-2">
          <CardHeader title="Quizzes & exams" />
          {sessions.length === 0 ? (
            <EmptyState title="None yet" />
          ) : (
            <ul className="divide-y divide-border">
              {sessions.map(({ session, quizTitle }) => (
                <li key={session.id}>
                  <Link
                    href={`/teacher/assessments/${session.quizId}/sessions/${session.id}`}
                    className="block px-5 py-3.5 hover:bg-surface-muted"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate font-medium">{quizTitle}</span>
                      <ModeBadge mode={session.mode} />
                      <StatusBadge status={session.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-muted">
                      {session.opensAt ? `Opens ${formatDateTime(session.opensAt)}` : "Not scheduled"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
