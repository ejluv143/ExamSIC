import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { createClassAction } from "../actions";
import { ClassForm } from "../class-form";

export const metadata: Metadata = { title: "New class" };

export default function NewClassPage() {
  return (
    <>
      <PageHeader
        back={{ href: "/teacher/classes", label: "Classes" }}
        title="New class"
        description="You get a class code to share; students join with it."
      />
      <Card className="max-w-2xl p-5 sm:p-6">
        <ClassForm action={createClassAction} cancelHref="/teacher/classes" submitLabel="Create class" />
      </Card>
    </>
  );
}
