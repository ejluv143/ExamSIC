import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { AiKeyManager } from "@/features/ai/components/ai-key-manager";
import { requirePermission } from "@/lib/auth/dal";
import { getAiKeys } from "@/features/ai/data";

export const metadata: Metadata = { title: "AI keys" };

export default async function OrganizationAiPage() {
  await requirePermission({ ai: ["configure"] });
  const keys = await getAiKeys();

  return (
    <>
      <PageHeader
        title="AI keys"
        description="Teachers use these keys for AI help: drafting questions and suggesting essay scores."
      />
      <AiKeyManager keys={keys} />
    </>
  );
}
