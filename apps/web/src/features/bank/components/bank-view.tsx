"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, Database, FolderTree, ListTree, Share2, Tags } from "lucide-react";
import type { BankQuestion } from "@examinus/contract/bank";
import type { Question } from "@examinus/domain/question";
import { Dialog } from "@/components/dialog";
import { Button, Card, EmptyState, IconStat, PageHeader } from "@/components/ui";
import { AddQuestionMenu } from "@/features/quiz/components/add-question-menu";
import { copyToBankAction, deleteBankQuestionsAction } from "@/features/bank/actions";
import {
  applyFilters,
  filtersToParams,
  noFilters,
  parseFilters,
  groupId,
  sourceOf,
  subjectsOf,
  topicsOf,
  type Filters,
} from "../model";
import { AiBankGenerate } from "./ai-bank";
import { AddToQuizDialog } from "./add-to-quiz-dialog";
import type { CardAction } from "./bank-card";
import { SectionView, TopicNav, TopicView } from "./bank-groups";
import { BankToolbar } from "./bank-toolbar";
import { ManageTagsDialog } from "./manage-tags-dialog";
import { QuestionDialog, type QuestionDraft } from "./question-dialog";
import { RetagDialog } from "./retag-dialog";
import { SelectionBar } from "./selection-bar";
import { ShareDialog, type ShareTarget } from "./share-dialog";

type Notice = { text: string; error?: boolean };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The question bank page: counts, search and filters (kept in the URL), the By Section and By Topic views, the
// selection bar and the dialogs the actions open.
export function BankView({ bank, assetUrls, canShare }: { bank: readonly BankQuestion[]; assetUrls: Record<string, string>; canShare: boolean }) {
  const params = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => parseFilters(params));
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const [retag, setRetag] = useState<readonly BankQuestion[] | null>(null);
  const [share, setShare] = useState<ShareTarget | null>(null);
  const [addToQuiz, setAddToQuiz] = useState<readonly BankQuestion[] | null>(null);
  const [manageTags, setManageTags] = useState(false);
  const [panel, setPanel] = useState(false);

  // The view and filters go into the URL without a new history entry or a trip to the server.
  function update(change: Partial<Filters>) {
    const next = { ...filters, ...change };
    setFilters(next);
    const query = filtersToParams(next).toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }

  const shown = applyFilters(bank, filters);
  const mine = bank.filter((b) => b.mine);
  const subjects = subjectsOf(bank);
  const topics = topicsOf(bank);
  const selected = shown.filter((b) => selectedIds.has(b.question.id));
  const counts = {
    subjects: subjects.length,
    topics: topics.length,
    shared: bank.filter((b) => sourceOf(b) === "shared").length,
  };

  async function run(task: () => Promise<{ ok: unknown } | { error: string }>, success: string) {
    setBusy(true);
    const result = await task();
    setBusy(false);
    if ("error" in result) setNotice({ text: result.error, error: true });
    else {
      setNotice({ text: success });
      setSelectedIds(new Set());
    }
  }

  const copy = (items: readonly BankQuestion[]) =>
    run(() => copyToBankAction(items.map((b) => b.question.id)), `Copied ${plural(items.length, "question")} to your bank.`);

  function remove(items: readonly BankQuestion[]) {
    if (!window.confirm(`Delete ${plural(items.length, "question")} from your bank? Quizzes that already use them keep their own copies. This can't be undone.`)) return;
    run(() => deleteBankQuestionsAction(items.map((b) => b.question.id)), `Deleted ${plural(items.length, "question")}.`);
  }

  function onAction(action: CardAction, item: BankQuestion) {
    if (action === "edit") setDraft({ question: item.question, item });
    else if (action === "retag") setRetag([item]);
    else if (action === "share") setShare({ items: [item] });
    else if (action === "copy") copy([item]);
    else remove([item]);
  }

  function toggle(key: string) {
    const next = new Set(collapsed);
    if (!next.delete(key)) next.add(key);
    setCollapsed(next);
  }

  // The side panel: open the group (and the subject around a topic) and scroll to it.
  function jump(keys: string[]) {
    const next = new Set(collapsed);
    for (const key of keys) next.delete(key);
    setCollapsed(next);
    setPanel(false);
    setTimeout(() => document.getElementById(groupId(keys[keys.length - 1]!))?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  const common = {
    selection: { ids: selectedIds, set: setSelectedIds },
    collapsing: { collapsed, toggle },
    onAction,
    assetUrls,
    canShare,
  };
  const mineSubjects = subjectsOf(mine);
  const mineTopics = topicsOf(mine);

  return (
    <>
      <PageHeader
        title="Question bank"
        description="Your reusable questions, the ones teachers shared with you and the school library. Add them to any quiz or exam."
        actions={
          <>
            <AddQuestionMenu
              area="general"
              allTypes
              label="New question"
              variant="primary"
              onAdd={(question: Question) => setDraft({ question, item: null })}
            />
            <AiBankGenerate />
            <Button variant="secondary" onClick={() => setManageTags(true)} aria-haspopup="dialog">
              <Tags className="size-4" aria-hidden /> Manage tags
            </Button>
          </>
        }
      />

      <Card className="mb-6 grid gap-px overflow-hidden bg-border sm:grid-cols-2 lg:grid-cols-4">
        <IconStat icon={BookOpen} label="Questions" value={bank.length} />
        <IconStat icon={FolderTree} label="Subjects" value={counts.subjects} tone="success" />
        <IconStat icon={ListTree} label="Topics" value={counts.topics} tone="info" />
        <IconStat icon={Share2} label="Shared with me" value={counts.shared} tone="warning" />
      </Card>

      <div aria-live="polite" className="mb-3 empty:hidden">
        {notice && (
          <p role={notice.error ? "alert" : "status"} className={notice.error ? "rounded-lg bg-danger-soft p-3 text-sm text-danger" : "rounded-lg bg-success-soft p-3 text-sm text-success"}>
            {notice.text}
          </p>
        )}
      </div>

      {bank.length === 0 ? (
        <Card>
          <EmptyState title="Your question bank is empty" icon={Database}>
            Write a question with New question, or let the AI draft some. Questions teachers share with you show up here too.
          </EmptyState>
        </Card>
      ) : (
        <div aria-busy={busy}>
          <BankToolbar
            filters={filters}
            onChange={update}
            onClear={() => update({ ...noFilters, view: filters.view })}
            subjects={subjects}
            topics={topicsOf(bank, filters.subject)}
          />
          {shown.length === 0 ? (
            <Card>
              <EmptyState title="No matching questions">
                Nothing in the bank fits the search and filters.
                <Button variant="text" onClick={() => update({ ...noFilters, view: filters.view })}>
                  Clear filters
                </Button>
              </EmptyState>
            </Card>
          ) : filters.view === "section" ? (
            <SectionView items={shown} {...common} />
          ) : (
            <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6">
              <aside className="hidden lg:block">
                <div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-border bg-surface p-2">
                  <TopicNav items={shown} onJump={jump} />
                </div>
              </aside>
              <div className="min-w-0">
                <Button variant="secondary" className="mb-4 lg:hidden" onClick={() => setPanel(true)} aria-haspopup="dialog">
                  <ListTree className="size-4" aria-hidden /> Subjects and topics
                </Button>
                <TopicView
                  items={shown}
                  {...common}
                  onShare={(scope) => setShare({ items: [], ...scope })}
                />
              </div>
            </div>
          )}
          <SelectionBar
            count={selected.length}
            allMine={selected.every((b) => b.mine)}
            canShare={canShare}
            onClear={() => setSelectedIds(new Set())}
            onRetag={() => setRetag(selected)}
            onShare={() => setShare({ items: selected })}
            onAddToQuiz={() => setAddToQuiz(selected)}
            onCopy={() => copy(selected.filter((b) => !b.mine))}
            onDelete={() => remove(selected)}
          />
        </div>
      )}

      <Dialog open={panel} onClose={() => setPanel(false)} title="Subjects and topics" drawer>
        <TopicNav items={shown} onJump={jump} />
      </Dialog>
      <QuestionDialog
        draft={draft}
        subjects={subjects}
        topics={topics}
        assetUrls={assetUrls}
        onClose={() => setDraft(null)}
        onDone={(text) => setNotice({ text })}
      />
      <RetagDialog items={retag} subjects={subjects} topics={topics} onClose={() => setRetag(null)} onDone={(text) => { setNotice({ text }); setSelectedIds(new Set()); }} />
      {canShare && <ShareDialog target={share} subjects={mineSubjects} topics={mineTopics} onClose={() => setShare(null)} onDone={(text) => setNotice({ text })} />}
      <ManageTagsDialog open={manageTags} items={mine} onClose={() => setManageTags(false)} onDone={(text) => setNotice({ text })} />
      <AddToQuizDialog items={addToQuiz} onClose={() => setAddToQuiz(null)} />
    </>
  );
}
