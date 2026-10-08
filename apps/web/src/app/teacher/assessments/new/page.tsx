import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/dal";

// Creating a quiz starts in the details dialog on the list, which opens by itself on this address.
export default async function NewQuizPage(props: PageProps<"/teacher/assessments/new">) {
  await requirePermission({ assessment: ["create"] });
  const { class: classId } = await props.searchParams;
  redirect(`/teacher/assessments?new=1${typeof classId === "string" ? `&class=${encodeURIComponent(classId)}` : ""}`);
}
