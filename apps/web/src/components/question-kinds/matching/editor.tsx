"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Link2, Plus, Shuffle, Trash2, Unlink } from "lucide-react";
import { Button } from "@/components/ui";
import { Select } from "@/components/select";
import { ImageField, withImage } from "../shared/editor-image-field";
import { newId, weightsAdd, weightsRemove } from "@examinus/domain/kinds/editor";
import { InlineField } from "../shared/editor-fields";
import type { EditorProps } from "../views/editor";

type Q = EditorProps<"matching">["q"];
type RightItem = Q["right"][number];

// A matching question as the teacher thinks of it: pairs, each an item and its correct match on one row, then the
// wrong answers that match nothing. Underneath, every left item points at a right item (`rightId`); several items may
// share one answer ("Manila" and "Cebu" both go with "Philippines"), and right items no item points at are the wrong
// answers. Students match each item from one shuffled pool of every answer.
export function Editor({ q, onChange }: EditorProps<"matching">) {
  const rightById = Object.fromEntries(q.right.map((r) => [r.id, r]));
  // How many items each answer is the match of.
  const uses: Record<string, number> = {};
  for (const l of q.left) uses[l.rightId] = (uses[l.rightId] ?? 0) + 1;
  const decoys = q.right.filter((r) => !uses[r.id]);
  const itemNumbers = (rightId: string) =>
    q.left.flatMap((l, i) => (l.rightId === rightId ? [i + 1] : [])).join(", ");

  const setLeft = (id: string, patch: (l: Q["left"][number]) => Q["left"][number]) =>
    onChange({ ...q, left: q.left.map((l) => (l.id === id ? patch(l) : l)) });
  const setRight = (id: string, patch: (r: RightItem) => RightItem) =>
    onChange({ ...q, right: q.right.map((r) => (r.id === id ? patch(r) : r)) });

  // Writing the match of an item that has none (its answer was deleted) gives it a new answer.
  function writeMatch(leftId: string, rightId: string, text: string) {
    if (rightById[rightId]) return setRight(rightId, (r) => ({ ...r, text }));
    const id = newId();
    onChange({ ...q, right: [...q.right, { id, text }], left: q.left.map((l) => (l.id === leftId ? { ...l, rightId: id } : l)) });
  }

  function addPair() {
    const rightId = newId();
    onChange({ ...q, left: [...q.left, { id: newId(), text: "", rightId }], right: [...q.right, { id: rightId, text: "" }], ...weightsAdd(q) });
  }

  // Removing a pair removes its answer too, unless another item shares it.
  function removePair(i: number) {
    const l = q.left[i]!;
    const shared = (uses[l.rightId] ?? 0) > 1;
    onChange({
      ...q,
      left: q.left.filter((x) => x.id !== l.id),
      right: shared ? q.right : q.right.filter((r) => r.id !== l.rightId),
      ...weightsRemove(q, i),
    });
  }

  // An item sharing an answer gets a copy of its own, to change without changing the others.
  function unshare(leftId: string, rightId: string) {
    const from = rightById[rightId];
    const id = newId();
    onChange({
      ...q,
      right: [...q.right, { id, text: from?.text ?? "" }],
      left: q.left.map((l) => (l.id === leftId ? { ...l, rightId: id } : l)),
    });
  }

  // Points an item at another answer; an answer left with no item becomes a wrong answer only if it has text.
  function link(leftId: string, from: string, to: string) {
    const orphan = (uses[from] ?? 0) === 1 && !rightById[from]?.text.trim() && !rightById[from]?.imageId;
    onChange({
      ...q,
      left: q.left.map((l) => (l.id === leftId ? { ...l, rightId: to } : l)),
      right: orphan ? q.right.filter((r) => r.id !== from) : q.right,
    });
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="matching-pairs" className="space-y-3">
        <div>
          <h4 id="matching-pairs" className="text-sm font-bold">
            Pairs
          </h4>
          <p className="text-xs text-muted">Write each item and its correct match on the same row.</p>
        </div>

        <div className="hidden grid-cols-[2rem_minmax(0,1fr)_1.25rem_minmax(0,1fr)_2.75rem] gap-x-3 px-3 text-xs font-semibold tracking-wide text-muted uppercase sm:grid">
          <span aria-hidden />
          <span>Item</span>
          <span aria-hidden />
          <span>Correct match</span>
          <span aria-hidden />
        </div>

        <ol className="space-y-2">
          {q.left.map((l, i) => {
            const r = rightById[l.rightId];
            const shared = (uses[l.rightId] ?? 0) > 1;
            const others = q.right.filter((x) => x.id !== l.rightId);
            const missing = !r || (!r.text.trim() && !r.imageId);
            return (
              <li
                key={l.id}
                className="grid grid-cols-[2rem_minmax(0,1fr)_2.75rem] items-start gap-x-3 gap-y-2 rounded-xl border border-border bg-surface p-3 shadow-sm sm:grid-cols-[2rem_minmax(0,1fr)_1.25rem_minmax(0,1fr)_2.75rem]"
              >
                <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-sm font-bold text-primary tabular-nums" aria-hidden>
                  {i + 1}
                </span>

                <div className="min-w-0 space-y-1.5">
                  <span className="block text-xs font-semibold text-muted sm:hidden">Item</span>
                  <InlineField
                    value={l.text}
                    onChange={(text) => setLeft(l.id, (x) => ({ ...x, text }))}
                    placeholder="e.g. Manila"
                    label={`Pair ${i + 1}: item`}
                  />
                  <ImageField
                    compact
                    imageId={l.imageId}
                    alt={l.alt}
                    label={`pair ${i + 1} item`}
                    onChange={(picked) => setLeft(l.id, (x) => withImage(x, picked))}
                  />
                </div>

                <ArrowRight className="mt-3 hidden size-5 text-muted sm:block" aria-hidden />

                <div className="col-start-2 min-w-0 space-y-1.5 sm:col-start-auto">
                  <span className="block text-xs font-semibold text-muted sm:hidden">Correct match</span>
                  <div className={missing ? "rounded-lg ring-2 ring-danger/60" : undefined}>
                    <InlineField
                      value={r?.text ?? ""}
                      onChange={(text) => writeMatch(l.id, l.rightId, text)}
                      placeholder="e.g. Philippines"
                      label={`Pair ${i + 1}: correct match`}
                    />
                  </div>
                  {r && (
                    <ImageField
                      compact
                      imageId={r.imageId}
                      alt={r.alt}
                      label={`pair ${i + 1} match`}
                      onChange={(picked) => setRight(r.id, (x) => withImage(x, picked))}
                    />
                  )}
                  {missing && <p className="text-xs font-semibold text-danger">Write the match, or pick an existing answer.</p>}
                  {shared && (
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 font-semibold text-info">
                        <Link2 className="size-3" aria-hidden /> Same answer as items {itemNumbers(l.rightId)}
                      </span>
                      <button
                        type="button"
                        onClick={() => unshare(l.id, l.rightId)}
                        className="inline-flex items-center gap-1 rounded font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <Unlink className="size-3" aria-hidden /> Give it its own
                      </button>
                    </p>
                  )}
                  {others.length > 0 && (
                    <Reveal label="Same answer as another item…">
                      <Select
                        value=""
                        aria-label={`Pair ${i + 1}: use an existing answer instead`}
                        onChange={(to) => to && link(l.id, l.rightId, to)}
                        placeholder="Pick the answer…"
                        options={others.map((x) => ({
                          value: x.id,
                          label: x.text.trim() || (x.imageId ? "Picture" : "(empty answer)"),
                          description: uses[x.id] ? `Match of item ${itemNumbers(x.id)}` : "A wrong answer",
                        }))}
                        className="w-full"
                        triggerClassName="min-h-9 text-xs"
                      />
                    </Reveal>
                  )}
                </div>

                <Button
                  variant="ghost"
                  className="col-start-3 row-start-1 size-11 px-0 text-muted hover:text-danger sm:col-start-auto sm:row-start-auto"
                  aria-label={`Remove pair ${i + 1}`}
                  title="Remove this pair"
                  disabled={q.left.length <= 1}
                  onClick={() => removePair(i)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            );
          })}
        </ol>

        <Button variant="secondary" onClick={addPair}>
          <Plus className="size-4" aria-hidden /> Add pair
        </Button>
      </section>

      <section aria-labelledby="matching-decoys" className="space-y-3">
        <div>
          <h4 id="matching-decoys" className="text-sm font-bold">
            Wrong answers <span className="font-normal text-muted">(optional)</span>
          </h4>
          <p className="text-xs text-muted">Extra answers that match no item, so the last match can&apos;t be guessed.</p>
        </div>
        {decoys.length > 0 && (
          <ul className="space-y-2">
            {decoys.map((d, i) => (
              <li key={d.id} className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-surface-muted/40 p-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <InlineField
                    value={d.text}
                    onChange={(text) => setRight(d.id, (x) => ({ ...x, text }))}
                    placeholder="e.g. Japan"
                    label={`Wrong answer ${i + 1}`}
                  />
                  <ImageField compact imageId={d.imageId} alt={d.alt} label={`wrong answer ${i + 1}`} onChange={(picked) => setRight(d.id, (x) => withImage(x, picked))} />
                </div>
                <Button
                  variant="ghost"
                  className="size-11 px-0 text-muted hover:text-danger"
                  aria-label={`Remove wrong answer ${i + 1}`}
                  title="Remove this wrong answer"
                  onClick={() => onChange({ ...q, right: q.right.filter((x) => x.id !== d.id) })}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button variant="ghost" className="text-primary" onClick={() => onChange({ ...q, right: [...q.right, { id: newId(), text: "" }] })}>
          <Plus className="size-4" aria-hidden /> Add a wrong answer
        </Button>
      </section>

      <p className="flex items-start gap-2 rounded-xl bg-surface-muted/60 px-3 py-2.5 text-xs text-muted">
        <Shuffle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Students see the {q.left.length} {q.left.length === 1 ? "item" : "items"} in a column and match each one from a shuffled pool of{" "}
          {q.right.length} {q.right.length === 1 ? "answer" : "answers"}
          {decoys.length > 0 && ` (${decoys.length} of them wrong)`}.
        </span>
      </p>
    </div>
  );
}

// A rarely needed control, behind a small link until it's asked for.
function Reveal({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (open) return children;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1 rounded text-xs font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <Link2 className="size-3" aria-hidden /> {label}
    </button>
  );
}
