import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getClassroomCourses } from "@/lib/data/classroom";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import from Google Classroom" };

export default async function ImportPage() {
  const result = await getClassroomCourses();
  return (
    <>
      <PageHeader
        back={{ href: "/teacher/classes", label: "Classes" }}
        title="Import from Google Classroom"
        description="Each course you pick becomes a class here, with its students. Students sign in with the same Google email to see it."
      />
      {"error" in result ? (
        <Card className="p-5">
          <p role="alert" className="text-sm text-danger">
            {result.error}
          </p>
          <p className="mt-3 text-sm">
            <Link href="/teacher/classes" className="font-medium text-primary hover:underline">
              Back to classes
            </Link>
          </p>
        </Card>
      ) : result.courses.length === 0 ? (
        <Card>
          <EmptyState title="No active courses">You don&apos;t teach any active courses in Google Classroom.</EmptyState>
        </Card>
      ) : (
        <ImportForm courses={result.courses} />
      )}
    </>
  );
}
