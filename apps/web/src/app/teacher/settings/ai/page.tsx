import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { AiKeyManager } from "@/components/ai-key-manager";
import { requirePermission } from "@/lib/auth/dal";
import { getAiKeys } from "@/lib/data/ai";

export const metadata: Metadata = { title: "AI keys" };

export default async function TeacherAiKeysPage() {
  await requirePermission({ ai: ["use"] });
  const keys = await getAiKeys("own");

  return (
    <>
      <PageHeader
        title="AI keys"
        description="Your own keys for AI help in the quiz editor and grading. They take priority over the school's keys for the same provider."
      />
      <AiKeyManager scope="own" keys={keys} />
    </>
  );
}
