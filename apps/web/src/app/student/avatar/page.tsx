import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getMyAvatar } from "@/lib/data/avatar";
import { AvatarForm } from "./avatar-form";

export const metadata: Metadata = { title: "Avatar" };

export default async function AvatarPage() {
  const avatar = await getMyAvatar();
  return (
    <>
      <PageHeader title="Avatar" description="Other players see it in games: in the lobby, on the leaderboard and on the podium." />
      <AvatarForm initial={avatar} />
    </>
  );
}
