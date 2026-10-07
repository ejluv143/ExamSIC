import { redirect } from "next/navigation";

// A link a teacher can share: /join?code=ABC-DEFG (students sign in first, then land on the join page).
export default async function JoinRedirect(props: PageProps<"/join">) {
  const { code } = await props.searchParams;
  const value = typeof code === "string" ? code : "";
  redirect(value ? `/student/join?code=${encodeURIComponent(value)}` : "/student/join");
}
