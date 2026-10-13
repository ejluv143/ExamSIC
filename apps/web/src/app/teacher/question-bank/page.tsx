import type { Metadata } from "next";
import { listBank } from "@/features/bank/data";
import { contentAssetUrls } from "@/features/quiz/data";
import { BankView } from "@/features/bank/components/bank-view";

export const metadata: Metadata = { title: "Question bank" };

export default async function QuestionBankPage() {
  const bank = await listBank();
  const assetUrls = await contentAssetUrls(bank.map((b) => b.question));
  return <BankView bank={bank} assetUrls={assetUrls} />;
}
