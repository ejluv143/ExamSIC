import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/dal";
import { listBank } from "@/features/bank/data";
import { contentAssetUrls } from "@/features/quiz/data";
import { BankView } from "@/features/bank/components/bank-view";

export const metadata: Metadata = { title: "Question bank" };

export default async function QuestionBankPage() {
  const [user, bank] = await Promise.all([getCurrentUser(), listBank()]);
  const assetUrls = await contentAssetUrls(bank.map((b) => b.question));
  // Sharing is organization-only.
  return <BankView bank={bank} assetUrls={assetUrls} canShare={user.organization !== null} />;
}
