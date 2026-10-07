import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getClassRecord } from "@/lib/data/class-records";
import { RecordEditor } from "./record-editor";

export async function generateMetadata(props: PageProps<"/teacher/classes/[classId]/record">): Promise<Metadata> {
  const { classId } = await props.params;
  const data = await getClassRecord(classId);
  return { title: data ? `Class record · ${data.cls.courseCode} ${data.cls.section}` : "Class record" };
}

export default async function ClassRecordPage(props: PageProps<"/teacher/classes/[classId]/record">) {
  const { classId } = await props.params;
  const data = await getClassRecord(classId);
  if (!data) notFound();
  const { cls } = data;

  return (
    <>
      <PageHeader
        back={{ href: `/teacher/classes/${cls.id}`, label: `${cls.courseCode} · ${cls.section}` }}
        title="Class record"
        description={`${cls.courseCode} · ${cls.title} · ${cls.term}`}
      />
      <RecordEditor
        cls={cls}
        initial={data.record}
        students={data.students.map((s) => ({
          id: s.id,
          name: `${s.lastName}, ${s.firstName}`,
          studentNumber: s.studentNumber,
          sex: s.sex,
        }))}
        linked={data.linked}
        pending={data.pending}
        linkable={data.linkable}
        attendanceTaken={data.attendanceTaken}
        attendance={data.attendance}
      />
    </>
  );
}
