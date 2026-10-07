import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { termOf } from "@/lib/attendance";
import { getMeeting } from "@/lib/data/attendance";
import { formatDay } from "@/lib/format";
import { RollCall } from "./roll-call";

export const metadata: Metadata = { title: "Take attendance" };

export default async function MeetingPage(props: PageProps<"/teacher/classes/[classId]/attendance/[meetingId]">) {
  const { classId, meetingId } = await props.params;
  const data = await getMeeting(classId, meetingId);
  if (!data) notFound();
  const { cls, meeting } = data;
  return (
    <>
      <PageHeader
        back={{ href: `/teacher/classes/${cls.id}/attendance`, label: "Attendance" }}
        title={formatDay(`${meeting.date}T12:00:00+08:00`)}
        description={`${cls.courseCode} · ${cls.section} · ${cls.schedule} · ${termOf(meeting.date) === "midterm" ? "Midterm" : "Final term"}`}
      />
      <RollCall
        classId={cls.id}
        meetingId={meeting.id}
        initial={meeting.records}
        taken={!!meeting.takenAt}
        students={data.students.map((s) => ({ id: s.id, name: `${s.lastName}, ${s.firstName}`, sex: s.sex }))}
      />
    </>
  );
}
