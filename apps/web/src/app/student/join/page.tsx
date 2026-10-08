import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Join with a key" };

export default async function JoinPage(props: PageProps<"/student/join">) {
  const { code } = await props.searchParams;
  return (
    <>
      <PageHeader title="Join with a key" description="Enter the 7-character key your teacher shows." />
      <JoinForm initialCode={typeof code === "string" ? code : ""} />
    </>
  );
}
