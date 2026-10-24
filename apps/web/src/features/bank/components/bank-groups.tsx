"use client";

import { useEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";
import { ChevronDown, Share2 } from "lucide-react";
import type { BankQuestion } from "@examinus/contract/bank";
import { Button } from "@/components/ui";
import { questionTypeLabel } from "@/lib/format";
import {
  groupBySection,
  groupByTopic,
  groupId,
  totalPoints,
  type Group,
  type SubjectGroup,
} from "../model";
import { BankCard, type CardAction } from "./bank-card";

export type Selection = { ids: ReadonlySet<string>; set: (ids: ReadonlySet<string>) => void };
export type Collapsing = { collapsed: ReadonlySet<string>; toggle: (key: string) => void };

type CommonProps = {
  selection: Selection;
  collapsing: Collapsing;
  onAction: (action: CardAction, item: BankQuestion) => void;
  assetUrls: Record<string, string>;
  // Sharing is organization-only: without an organization the Share controls are hidden.
  canShare: boolean;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The toggle and the "select all" of one group. The toggle is the only part that collapses; the checkbox beside it
// selects every question in the group.
function GroupHeader({
  title,
  items,
  expanded,
  onToggle,
  selection,
  controls,
  level = 1,
  extra,
}: {
  title: string;
  items: readonly BankQuestion[];
  expanded: boolean;
  onToggle: () => void;
  selection: Selection;
  controls: string;
  level?: 1 | 2;
  extra?: ReactNode;
}) {
  const checkbox = useRef<HTMLInputElement>(null);
  const picked = items.filter((b) => selection.ids.has(b.question.id)).length;
  useEffect(() => {
    if (checkbox.current) checkbox.current.indeterminate = picked > 0 && picked < items.length;
  }, [picked, items.length]);

  return (
    <div className="flex items-center gap-3">
      <input
        ref={checkbox}
        type="checkbox"
        checked={picked === items.length && items.length > 0}
        onChange={(e) => {
          const next = new Set(selection.ids);
          for (const b of items) {
            if (e.target.checked) next.add(b.question.id);
            else next.delete(b.question.id);
          }
          selection.set(next);
        }}
        aria-label={`Select all in ${title}`}
        className="size-4 shrink-0 accent-primary"
      />
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={controls}
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left focus-visible:outline-2 focus-visible:outline-primary"
      >
        <ChevronDown className={clsx("size-4 shrink-0 text-muted transition-transform", !expanded && "-rotate-90")} aria-hidden />
        <span className={clsx("truncate", level === 1 ? "text-base font-semibold" : "text-sm font-semibold")}>{title}</span>
        <span className="shrink-0 text-xs text-muted tabular-nums">
          {plural(items.length, "question")} · {totalPoints(items)} pts
        </span>
      </button>
      {extra}
    </div>
  );
}

function Cards({ items, selection, onAction, assetUrls, canShare }: { items: readonly BankQuestion[] } & Omit<CommonProps, "collapsing">) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <BankCard
          key={item.question.id}
          item={item}
          selected={selection.ids.has(item.question.id)}
          onSelect={(on) => {
            const next = new Set(selection.ids);
            if (on) next.add(item.question.id);
            else next.delete(item.question.id);
            selection.set(next);
          }}
          onAction={onAction}
          assetUrls={assetUrls}
          canShare={canShare}
        />
      ))}
    </ul>
  );
}

// By Section: the questions grouped by type, in the order of a test paper.
export function SectionView({ items, ...common }: { items: readonly BankQuestion[] } & CommonProps) {
  const groups: Group[] = groupBySection(items, (type) => questionTypeLabel[type]);
  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const expanded = !common.collapsing.collapsed.has(group.key);
        const id = groupId(group.key);
        return (
          <section key={group.key} id={id} aria-label={group.label} className="scroll-mt-24 space-y-2">
            <GroupHeader
              title={group.label}
              items={group.items}
              expanded={expanded}
              onToggle={() => common.collapsing.toggle(group.key)}
              selection={common.selection}
              controls={`${id}-body`}
            />
            {expanded && (
              <div id={`${id}-body`}>
                <Cards items={group.items} {...common} />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// By Topic: subject, then topic, each collapsible. `onShare` shares a whole subject or topic of the teacher's.
export function TopicView({
  items,
  onShare,
  ...common
}: {
  items: readonly BankQuestion[];
  onShare: (scope: { subject: string } | { topic: string }) => void;
} & CommonProps) {
  const subjects: SubjectGroup[] = groupByTopic(items);
  return (
    <div className="space-y-6">
      {subjects.map((subject) => {
        const expanded = !common.collapsing.collapsed.has(subject.key);
        const id = groupId(subject.key);
        return (
          <section key={subject.key} id={id} aria-label={subject.label} className="scroll-mt-24 space-y-3">
            <GroupHeader
              title={subject.label}
              items={subject.items}
              expanded={expanded}
              onToggle={() => common.collapsing.toggle(subject.key)}
              selection={common.selection}
              controls={`${id}-body`}
              extra={
                common.canShare && subject.subject !== null && subject.items.some((b) => b.mine) ? (
                  <Button variant="ghost" className="shrink-0" onClick={() => onShare({ subject: subject.subject! })}>
                    <Share2 className="size-4" aria-hidden /> Share
                  </Button>
                ) : undefined
              }
            />
            {expanded && (
              <div id={`${id}-body`} className="space-y-4 border-l border-border pl-4">
                {subject.topics.map((topic) => {
                  const open = !common.collapsing.collapsed.has(topic.key);
                  const topicId = groupId(topic.key);
                  return (
                    <section key={topic.key} id={topicId} aria-label={topic.label} className="scroll-mt-24 space-y-2">
                      <GroupHeader
                        level={2}
                        title={topic.label}
                        items={topic.items}
                        expanded={open}
                        onToggle={() => common.collapsing.toggle(topic.key)}
                        selection={common.selection}
                        controls={`${topicId}-body`}
                        extra={
                          common.canShare && topic.topic !== null && topic.items.some((b) => b.mine) ? (
                            <Button variant="ghost" className="shrink-0" onClick={() => onShare({ topic: topic.topic! })}>
                              <Share2 className="size-4" aria-hidden /> Share
                            </Button>
                          ) : undefined
                        }
                      />
                      {open && (
                        <div id={`${topicId}-body`}>
                          <Cards items={topic.items} {...common} />
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// The side panel of the By Topic view: every subject and topic with its count, to jump to.
export function TopicNav({ items, onJump }: { items: readonly BankQuestion[]; onJump: (keys: string[]) => void }) {
  const subjects = groupByTopic(items);
  return (
    <nav aria-label="Subjects and topics">
      <ul className="space-y-1 text-sm">
        {subjects.map((subject) => (
          <li key={subject.key}>
            <button
              type="button"
              onClick={() => onJump([subject.key])}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left font-medium hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="truncate">{subject.label}</span>
              <span className="text-xs text-muted tabular-nums">{subject.items.length}</span>
            </button>
            <ul className="ml-3 border-l border-border pl-2">
              {subject.topics.map((topic) => (
                <li key={topic.key}>
                  <button
                    type="button"
                    onClick={() => onJump([subject.key, topic.key])}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <span className="truncate">{topic.label}</span>
                    <span className="text-xs tabular-nums">{topic.items.length}</span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
