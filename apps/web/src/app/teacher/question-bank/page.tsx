import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { contentAssetUrls, getQuestionBank } from "@/features/quiz/data";
import { AiBankGenerate } from "@/features/quiz/components/ai-bank";
import { BankList } from "@/features/quiz/components/bank-list";

export const metadata: Metadata = { title: "Question bank" };

export default async function QuestionBankPage() {
  const bank = await getQuestionBank();
  const assetUrls = await contentAssetUrls(bank);
  return (
    <>
      <PageHeader
        title="Question bank"
        description="Reusable questions, grouped by topic. Add them to any quiz or exam from the editor."
        actions={<AiBankGenerate />}
      />
      <BankList bank={bank} assetUrls={assetUrls} />
    </>
  );
}
