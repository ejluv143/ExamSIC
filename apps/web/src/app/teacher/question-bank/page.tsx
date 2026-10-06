import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getQuestionBank } from "@/lib/data/teacher";
import { BankList } from "./bank-list";

export const metadata: Metadata = { title: "Question bank" };

export default async function QuestionBankPage() {
  const bank = await getQuestionBank();
  return (
    <>
      <PageHeader
        title="Question bank"
        description="Reusable questions, grouped by topic. Add them to any quiz or exam from the editor."
      />
      <BankList bank={bank} />
    </>
  );
}
