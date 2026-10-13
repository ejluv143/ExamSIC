import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getMyAvatar } from "@/features/auth/data";
import { AvatarForm } from "@/features/auth/components/avatar-form";

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
