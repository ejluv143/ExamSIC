import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { getClass } from "@/lib/data/teacher";
import { archiveClassAction, updateClassAction } from "../../actions";
import { ClassForm } from "../../class-form";
import { ArchiveClassButton } from "../class-actions";

export const metadata: Metadata = { title: "Edit class" };

export default async function EditClassPage(props: PageProps<"/teacher/classes/[classId]/edit">) {
  const { classId } = await props.params;
  const cls = await getClass(classId);
  if (!cls) notFound();
  const back = `/teacher/classes/${cls.id}`;
  return (
    <>
      <PageHeader back={{ href: back, label: `${cls.courseCode} · ${cls.section}` }} title="Edit class" />
      <div className="max-w-2xl space-y-6">
        <Card className="p-5 sm:p-6">
          <ClassForm action={updateClassAction.bind(null, cls.id)} initial={cls} cancelHref={back} submitLabel="Save changes" />
        </Card>
        <Card>
          <CardHeader title="Archive" description="Hides the class from you and its students. Nothing is deleted." />
          <div className="p-5">
            <ArchiveClassButton action={archiveClassAction.bind(null, cls.id)} />
          </div>
        </Card>
      </div>
    </>
  );
}
