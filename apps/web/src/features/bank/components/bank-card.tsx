"use client";

import { useId, useState } from "react";
import clsx from "clsx";
import { ChevronDown, Copy, Pencil, Share2, Tag, Trash2 } from "lucide-react";
import type { BankQuestion } from "@examinus/contract/bank";
import { Badge } from "@/components/ui";
import { Menu, type MenuItem } from "@/components/menu";
import { Markdown } from "@/components/markdown";
import { Review } from "@/components/question-kinds/views/review";
import { QuestionTypeBadge } from "@/components/question-kinds/question-style";
import { firstLine, sourceOf } from "../model";

export type CardAction = "edit" | "retag" | "share" | "copy" | "delete";

// Who a question comes from, for its badge.
export function OwnerBadge({ item }: { item: BankQuestion }) {
  const source = sourceOf(item);
  if (source === "library") return <Badge tone="info">Library</Badge>;
  if (source === "mine") return <Badge tone="primary">Mine</Badge>;
  return <Badge tone="warning">Shared by {item.sharedBy?.name ?? item.owner?.name ?? "a teacher"}</Badge>;
}

// One question: a compact row (type, tags, points, owner, the first line of the prompt) that opens to the whole
// prompt and the answer key. Questions that aren't the teacher's offer only what they may do: copy.
export function BankCard({
  item,
  selected,
  onSelect,
  onAction,
  assetUrls,
  canShare,
}: {
  item: BankQuestion;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onAction: (action: CardAction, item: BankQuestion) => void;
  assetUrls: Record<string, string>;
  canShare: boolean;
}) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const { question: q } = item;
  const summary = firstLine(q.prompt);
  const act = (action: CardAction) => () => onAction(action, item);
  const items: MenuItem[] = item.mine
    ? [
        { label: "Edit", icon: Pencil, onSelect: act("edit") },
        { label: "Retag", icon: Tag, onSelect: act("retag") },
        ...(canShare ? [{ label: "Share", icon: Share2, onSelect: act("share") }] : []),
        { label: "Delete", icon: Trash2, danger: true, onSelect: act("delete") },
      ]
    : [{ label: "Copy to my bank", icon: Copy, onSelect: act("copy") }];

  return (
    <li className={clsx("rounded-xl border bg-surface", selected ? "border-primary ring-1 ring-primary/30" : "border-border")}>
      <div className="flex items-start gap-3 p-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          aria-label={`Select: ${summary}`}
          className="mt-1 size-4 shrink-0 accent-primary"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <QuestionTypeBadge type={q.type} {...("mode" in q ? { mode: q.mode } : {})} />
            {item.subject && <Badge tone="success">{item.subject}</Badge>}
            {item.topic && <Badge>{item.topic}</Badge>}
            <OwnerBadge item={item} />
            <span className="ml-auto text-xs text-muted tabular-nums">{q.points} pts</span>
          </div>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen(!open)}
            className="mt-1.5 flex w-full items-start gap-1.5 rounded-md text-left focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ChevronDown className={clsx("mt-0.5 size-4 shrink-0 text-muted transition-transform", !open && "-rotate-90")} aria-hidden />
            <span className={clsx("text-sm font-medium", !open && "line-clamp-2")}>{summary}</span>
          </button>
        </div>
        <Menu label={`Actions for: ${summary}`} items={items} />
      </div>
      {open && (
        <div id={detailId} className="space-y-3 border-t border-border px-4 py-3 sm:pl-10">
          <Markdown className="font-medium" assetUrls={assetUrls}>{q.prompt}</Markdown>
          <Review mode="key" q={q} urls={assetUrls} />
          {q.explanation && <p className="text-sm text-muted">{q.explanation}</p>}
        </div>
      )}
    </li>
  );
}
