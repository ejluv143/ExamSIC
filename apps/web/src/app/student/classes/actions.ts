"use server";

import { revalidatePath } from "next/cache";
import { joinClass, leaveClass } from "@/lib/data/student";

export type JoinState = { error: string } | { joined: true } | undefined;

export async function joinClassAction(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter the class code from your teacher." };
  const sex = formData.get("sex");
  const studentNumber = String(formData.get("studentNumber") ?? "").trim();
  if (studentNumber.length > 40) return { error: "That student number is too long." };
  const error = await joinClass(code, sex === "M" || sex === "F" ? sex : null, studentNumber || null);
  if (error) return { error };
  revalidatePath("/student", "layout");
  return { joined: true };
}

export async function leaveClassAction(classId: string): Promise<{ error: string } | undefined> {
  const error = await leaveClass(classId);
  if (error) return { error };
  revalidatePath("/student", "layout");
}
