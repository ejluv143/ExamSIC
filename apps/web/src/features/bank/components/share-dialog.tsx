"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { BankQuestion, BankShare } from "@examinus/contract/bank";
import { maxShareRecipients } from "@examinus/contract/bank";
import { Dialog } from "@/components/dialog";
import { Select } from "@/components/select";
import { Button, inputClass } from "@/components/ui";
import { emailPattern } from "@/lib/validate";
import { listBankSharesAction, shareBankAction, unshareBankAction } from "@/features/bank/actions";
import { firstLine } from "../model";

type Scope = "subject" | "topic" | "question";

// What the dialog opens for: the questions picked, and/or a whole subject or topic.
export type ShareTarget = { items: readonly BankQuestion[]; subject?: string; topic?: string };

const scopeText = (share: BankShare): string =>
  share.scope === "subject"
    ? `Subject: ${share.subject}`
    : share.scope === "topic"
      ? `Topic: ${share.topic}`
      : `Question: ${firstLine(share.prompt ?? "")}`;

// Shares with other teachers by email: by subject, by topic or the picked questions. Subject and topic shares
// stay live (questions added later are shared too). Lists what the teacher shares now, with a way to stop.
export function ShareDialog({
  target,
  subjects,
  topics,
  onClose,
  onDone,
}: {
  target: ShareTarget | null;
  // The subjects and topics of the teacher's own questions.
  subjects: readonly string[];
  topics: readonly string[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title="Share questions"
      description="Teachers you share with can read these questions, use them in quizzes and copy them. They can't change them."
      size="lg"
    >
      {target && <ShareForm target={target} subjects={subjects} topics={topics} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function ShareForm({
  target,
  subjects,
  topics,
  onClose,
  onDone,
}: {
  target: ShareTarget;
  subjects: readonly string[];
  topics: readonly string[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [scope, setScope] = useState<Scope>(target.topic ? "topic" : target.subject ? "subject" : "question");
  const [subject, setSubject] = useState(target.subject ?? subjects[0] ?? "");
  const [topic, setTopic] = useState(target.topic ?? topics[0] ?? "");
  const [emails, setEmails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shares, setShares] = useState<readonly BankShare[] | null>(null);

  const reload = useCallback(async () => setShares((await listBankSharesAction()).shared), []);
  useEffect(() => {
    let live = true;
    listBankSharesAction().then((s) => live && setShares(s.shared), () => live && setShares([]));
    return () => {
      live = false;
    };
  }, []);

  const hasQuestions = target.items.length > 0;
  const scopes: { value: Scope; label: string; available: boolean }[] = [
    { value: "question", label: `The ${target.items.length} selected question${target.items.length === 1 ? "" : "s"}`, available: hasQuestions },
    { value: "subject", label: "Everything in a subject", available: subjects.length > 0 },
    { value: "topic", label: "Everything in a topic", available: topics.length > 0 },
  ];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const recipients = [...new Set(emails.split(/[\s,;]+/).filter(Boolean).map((a) => a.toLowerCase()))];
    const bad = recipients.filter((a) => !emailPattern.test(a));
    if (recipients.length === 0) return setError("Enter the email of at least one teacher.");
    if (bad.length > 0) return setError(`Not an email address: ${bad.join(", ")}.`);
    if (recipients.length > maxShareRecipients) return setError(`Share with at most ${maxShareRecipients} teachers at a time.`);
    setBusy(true);
    setError(null);
    setNote(null);
    const result = await shareBankAction({
      recipients,
      scope,
      ...(scope === "subject" ? { subject } : {}),
      ...(scope === "topic" ? { topic } : {}),
      ...(scope === "question" ? { questionIds: target.items.map((b) => b.question.id) } : {}),
    });
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const message = result.ok.count === 0 ? "Already shared with them." : `Shared with ${recipients.join(", ")}.`;
    setNote(message);
    setEmails("");
    onDone(message);
    await reload();
  }

  async function remove(share: BankShare) {
    setError(null);
    const result = await unshareBankAction(share.id);
    if ("error" in result) setError(result.error);
    else {
      setNote(`Stopped sharing with ${share.recipient.name}.`);
      onDone(`Stopped sharing with ${share.recipient.name}.`);
      await reload();
    }
  }

  return (
    <div className="space-y-5" aria-busy={busy}>
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        )}
        {note && (
          <p role="status" className="rounded-lg bg-success-soft p-3 text-sm text-success">
            {note}
          </p>
        )}
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">What to share</legend>
          {scopes.filter((s) => s.value !== "question" || hasQuestions).map((s) => (
            <label key={s.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="share-scope"
                checked={scope === s.value}
                disabled={!s.available}
                onChange={() => setScope(s.value)}
                className="size-4 accent-primary"
              />
              <span className={s.available ? undefined : "text-muted"}>{s.label}</span>
            </label>
          ))}
          {scope === "subject" && (
            <Select value={subject} onChange={setSubject} aria-label="Subject to share" className="w-full" options={subjects.map((v) => ({ value: v, label: v }))} />
          )}
          {scope === "topic" && (
            <Select value={topic} onChange={setTopic} aria-label="Topic to share" className="w-full" options={topics.map((v) => ({ value: v, label: v }))} />
          )}
          {scope !== "question" && <p className="text-xs text-muted">Questions you add later to it are shared too.</p>}
        </fieldset>
        <div>
          <label htmlFor="share-emails" className="mb-1.5 block text-sm font-medium">
            Teacher emails
          </label>
          <textarea
            id="share-emails"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            rows={2}
            placeholder="name@school.edu, other@school.edu"
            aria-describedby="share-emails-hint"
            className={inputClass}
          />
          <p id="share-emails-hint" className="mt-1 text-xs text-muted">
            Separate several with commas or spaces. They need a teacher account.
          </p>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={busy || scopes.every((s) => s.value !== scope || !s.available)}>
            Share
          </Button>
        </div>
      </form>

      <section aria-labelledby="current-shares">
        <h3 id="current-shares" className="mb-2 text-sm font-semibold">
          Shared by you
        </h3>
        {shares === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : shares.length === 0 ? (
          <p className="text-sm text-muted">You haven&apos;t shared anything yet.</p>
        ) : (
          <ul className="max-h-60 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {shares.map((share) => (
              <li key={share.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{scopeText(share)}</p>
                  <p className="truncate text-xs text-muted">
                    with {share.recipient.name} ({share.recipient.email})
                  </p>
                </div>
                <Button variant="ghost" className="px-2" aria-label={`Stop sharing ${scopeText(share)} with ${share.recipient.name}`} onClick={() => remove(share)}>
                  <X className="size-4" aria-hidden /> Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
