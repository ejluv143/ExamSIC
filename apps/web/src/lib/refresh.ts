import { revalidatePath } from "next/cache";

// Lists, class records and students' pages all read quizzes and sessions.
export function refresh() {
  revalidatePath("/teacher", "layout");
  revalidatePath("/student", "layout");
}
