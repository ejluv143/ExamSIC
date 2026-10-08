import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, ExternalLink, Pencil, Plus, Printer, Sheet } from "lucide-react";
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { ClassroomSyncButton } from "@/components/classroom-sync-button";
import { KindBadge, StatusBadge } from "@/components/assessment-bits";
import { getAssessments, getClass, getStudents } from "@/lib/data/teacher";
import { formatDateTime, fullName } from "@/lib/format";
import { newJoinCodeAction, removeStudentAction } from "../actions";
import { JoinCode, RemoveStudentButton } from "./class-actions";

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

  const [students, assessments] = await Promise.all([
    getStudents(cls.studentIds),
    getAssessments({ classId }),
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
            <ButtonLink href={`/teacher/classes/${cls.id}/edit`} variant="secondary">
              <Pencil className="size-4" aria-hidden /> Edit
            </ButtonLink>
            <ButtonLink href={`/teacher/assessments/new?kind=exam&class=${cls.id}`}>
              <Plus className="size-4" aria-hidden /> New exam
            </ButtonLink>
          </>
        }
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <p className="font-medium">Class code</p>
          <p className="mt-0.5 mb-4 text-sm text-muted">
            Students sign up at Examinus, open Classes and enter this code to join.
          </p>
          {cls.joinCode && <JoinCode code={cls.joinCode} newCode={newJoinCodeAction.bind(null, cls.id)} />}
        </Card>
        {cls.classroom && (
          <Card className="flex flex-col justify-between gap-4 p-5">
            <div>
              <p className="font-medium">Linked to Google Classroom</p>
              <p className="mt-0.5 text-sm text-muted">
                The roster also comes from Classroom. Last synced {formatDateTime(cls.classroom.lastSyncedAt)}.
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
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Students" description={`${students.length} enrolled`} />
          {students.length === 0 ? (
            <EmptyState title="No students yet">Share the class code above; students show up here as they join.</EmptyState>
          ) : (
          <Table>
            <thead>
              <tr>
                <Th>Student no.</Th>
                <Th>Name</Th>
                <Th className="hidden md:table-cell">Email</Th>
                <Th>
                  <span className="sr-only">Remove</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <Td className="font-mono text-xs">{s.studentNumber}</Td>
                  <Td className="font-medium">{fullName(s)}</Td>
                  <Td className="hidden text-muted md:table-cell">{s.email}</Td>
                  <Td className="w-0 text-right">
                    <RemoveStudentButton name={fullName(s)} remove={removeStudentAction.bind(null, cls.id, s.id)} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          )}
        </Card>

        <Card className="self-start xl:col-span-2">
          <CardHeader title="Quizzes & exams" />
          {assessments.length === 0 ? (
            <EmptyState title="None yet" />
          ) : (
            <ul className="divide-y divide-border">
              {assessments.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/teacher/assessments/${a.id}`}
                    className="block px-5 py-3.5 hover:bg-surface-muted"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate font-medium">{a.title}</span>
                      <KindBadge kind={a.kind} />
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-muted">
                      {a.settings.opensAt ? `Opens ${formatDateTime(a.settings.opensAt)}` : "Not scheduled"}
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
