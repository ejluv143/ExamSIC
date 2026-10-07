import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";

// No public landing page yet; send people to their home, or to sign in.
export default async function Home() {
  const session = await readSession();
  redirect(!session ? "/login" : session.role === "teacher" ? "/teacher" : "/student");
}
