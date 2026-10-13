"use client";

import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import type { BankQuestion } from "@examinus/contract/bank";
import { Dialog } from "@/components/dialog";
import { Button } from "@/components/ui";
import { renameBankTagAction } from "@/features/bank/actions";
import { TagCombobox } from "./tag-combobox";

type Kind = "subject" | "topic";

// Counts of the teacher's own questions per tag name.
function tally(items: readonly BankQuestion[], kind: Kind): [string, number][] {
  const counts = new Map<string, number>();
  for (const b of items) {
    const name = b[kind];
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

// Rename a subject or topic across the teacher's questions; a name that exists merges into it.
export function ManageTagsDialog({
  open,
  items,
  onClose,
  onDone,
}: {
  open: boolean;
  // The teacher's own questions.
  items: readonly BankQuestion[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Manage tags"
      description="Rename a subject or topic everywhere you use it. Renaming to a name that already exists merges the two."
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-6">
        <TagList kind="subject" title="Subjects" items={items} onDone={onDone} />
        <TagList kind="topic" title="Topics" items={items} onDone={onDone} />
      </div>
    </Dialog>
  );
}

function TagList({ kind, title, items, onDone }: { kind: Kind; title: string; items: readonly BankQuestion[]; onDone: (message: string) => void }) {
  const tags = tally(items, kind);
  const [editing, setEditing] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent, from: string) {
    e.preventDefault();
    const name = to.trim();
    if (busy) return;
    if (!name || name === from) {
      setEditing(null);
      return;
    }
    const existing = tags.find(([tag]) => tag.toLowerCase() === name.toLowerCase() && tag !== from);
    if (existing && !window.confirm(`"${existing[0]}" already exists. Merge "${from}" into it? Its ${existing[1]} existing question${existing[1] === 1 ? "" : "s"} and these ${tags.find(([t]) => t === from)![1]} will share one ${kind}.`)) return;
    setBusy(true);
    setError(null);
    const result = await renameBankTagAction({ kind, from, to: existing ? existing[0] : name });
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setEditing(null);
    onDone(`${existing ? "Merged" : "Renamed"} ${kind} "${from}" ${existing ? "into" : "to"} "${existing ? existing[0] : name}" (${result.ok.count} ${result.ok.count === 1 ? "question" : "questions"}).`);
  }

  return (
    <section aria-label={title}>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {tags.length === 0 ? (
        <p className="text-sm text-muted">None of your questions has a {kind} yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {tags.map(([tag, count]) => (
            <li key={tag} className="px-3 py-2 text-sm">
              {editing === tag ? (
                <form onSubmit={(e) => submit(e, tag)} className="flex flex-wrap items-center gap-2">
                  <div className="min-w-48 flex-1">
                    <TagCombobox
                      autoFocus
                      aria-label={`New name for ${kind} ${tag}`}
                      value={to}
                      onChange={setTo}
                      options={tags.map(([t]) => t).filter((t) => t !== tag)}
                    />
                  </div>
                  <Button type="submit" disabled={busy}>
                    Save
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate">{tag}</span>
                  <span className="text-xs text-muted tabular-nums">
                    {count} question{count === 1 ? "" : "s"}
                  </span>
                  <Button
                    variant="ghost"
                    className="px-2"
                    aria-label={`Rename ${kind} ${tag}`}
                    onClick={() => {
                      setEditing(tag);
                      setTo(tag);
                      setError(null);
                    }}
                  >
                    <Pencil className="size-4" aria-hidden /> Rename
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
