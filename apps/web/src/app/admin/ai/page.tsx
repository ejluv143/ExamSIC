import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { AiKeyManager } from "@/components/ai-key-manager";
import { requirePermission } from "@/lib/auth/dal";
import { getAiKeys } from "@/lib/data/ai";

export const metadata: Metadata = { title: "AI keys" };

export default async function AdminAiPage() {
  await requirePermission({ ai: ["configure"] });
  const keys = await getAiKeys("school");

  return (
    <>
      <PageHeader
        title="AI keys"
        description="Teachers use these keys for AI help unless they add their own."
      />
      <AiKeyManager scope="school" keys={keys} />
    </>
  );
}
