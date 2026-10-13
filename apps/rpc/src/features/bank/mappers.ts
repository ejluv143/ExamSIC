// Bank rows as contract types. Pure.
import type { BankQuestion, BankShare } from "@examinus/contract/bank";
import type { BankRow, ShareRow } from "./Repo.ts";

export const toBankQuestion = ({ item, ownerName }: BankRow, userId: string): BankQuestion => {
  const mine = item.ownerId === userId;
  const owner = item.ownerId === null ? null : { id: item.ownerId, name: ownerName ?? "" };
  return {
    question: item.question,
    subject: item.subject,
    subjectArea: item.subjectArea,
    topic: item.topic,
    owner,
    mine,
    sharedBy: mine ? null : owner,
  };
};

export const toBankShare = (r: ShareRow): BankShare => ({
  id: r.share.id,
  scope: r.share.scope,
  subject: r.share.subject,
  topic: r.share.topic,
  questionId: r.question?.id ?? null,
  prompt: r.question?.prompt ?? null,
  owner: { id: r.share.ownerId, name: r.ownerName },
  recipient: { id: r.share.recipientId, name: r.recipientName, email: r.recipientEmail },
  createdAt: r.share.createdAt.toISOString(),
});
