import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Plus } from "lucide-react";
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { ClassroomSyncButton } from "@/components/classroom-sync-button";
import { KindBadge, StatusBadge } from "@/components/assessment-bits";
import { getAssessments, getClass, getStudents } from "@/lib/data/teacher";
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
          <ButtonLink href={`/teacher/assessments/new?kind=exam&class=${cls.id}`}>
            <Plus className="size-4" aria-hidden /> New exam
          </ButtonLink>
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
