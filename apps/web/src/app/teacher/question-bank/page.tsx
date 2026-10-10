import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { contentAssetUrls, getQuestionBank } from "@/lib/data/teacher";
import { AiBankGenerate } from "./ai-bank";
import { BankList } from "./bank-list";

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
