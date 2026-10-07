import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Join with code" };

export default async function JoinPage(props: PageProps<"/student/join">) {
  const { code } = await props.searchParams;
  return (
    <>
      <PageHeader title="Join with code" description="Type the code your teacher shows." />
      <JoinForm initialCode={typeof code === "string" ? code : ""} />
    </>
  );
}
