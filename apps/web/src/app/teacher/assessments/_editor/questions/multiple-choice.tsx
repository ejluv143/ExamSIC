"use client";

import clsx from "clsx";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { MultipleChoiceQuestion, Question } from "@examora/contract";
import { ImageField, withImage } from "../image-field";
import { newId, Check2, InlineField } from "./shared";

export function ChoicesEditor({ q, onChange }: { q: MultipleChoiceQuestion; onChange: (q: Question) => void }) {
  const multi = q.multipleCorrect;
  // With pictures the choices sit in a grid, as they do on the paper.
  const hasImages = q.choices.some((c) => c.imageId !== undefined);
  return (
    <div className="space-y-2">
      <Check2
        checked={multi}
        onChange={(multipleCorrect) =>
          onChange({
            ...q,
            multipleCorrect,
            correctChoiceIds: multipleCorrect ? q.correctChoiceIds : q.correctChoiceIds.slice(0, 1),
          })
        }
        hint="Students tick every correct choice."
      >
        More than one correct answer
      </Check2>
      <p className="text-xs text-muted">
        {multi ? "Tap the boxes to mark every correct choice." : "Tap the circle to mark the correct choice."}
      </p>
      <div className={clsx(hasImages ? "grid gap-2 sm:grid-cols-2" : "space-y-2")}>
      {q.choices.map((choice, i) => {
        const correct = q.correctChoiceIds.includes(choice.id);
        return (
          <div key={choice.id} className="flex items-start gap-2">
            <button
              type="button"
              aria-label={`Mark choice ${i + 1} correct`}
              aria-pressed={correct}
              onClick={() =>
                onChange({
                  ...q,
                  correctChoiceIds: multi
                    ? correct
                      ? q.correctChoiceIds.filter((id) => id !== choice.id)
                      : [...q.correctChoiceIds, choice.id]
                    : [choice.id],
                })
              }
              className={clsx(
                "mt-1.5 grid size-6 shrink-0 place-items-center border-2",
                multi ? "rounded-md" : "rounded-full",
                correct ? "border-success bg-success text-white" : "border-border hover:border-success",
              )}
            >
              {correct && <Check className="size-3.5" strokeWidth={3} />}
            </button>
            <div className="min-w-0 flex-1 space-y-1.5">
              <InlineField
                value={choice.text}
                onChange={(text) => onChange({ ...q, choices: q.choices.map((c) => (c.id === choice.id ? { ...c, text } : c)) })}
                placeholder={`Choice ${String.fromCharCode(65 + i)}`}
                label={`Choice ${String.fromCharCode(65 + i)}`}
              />
              <ImageField
                imageId={choice.imageId}
                alt={choice.alt}
                label={`choice ${String.fromCharCode(65 + i)}`}
                onChange={(picked) => onChange({ ...q, choices: q.choices.map((c) => (c.id === choice.id ? withImage(c, picked) : c)) })}
              />
            </div>
            <Button
              variant="ghost"
              className="px-2"
              aria-label={`Remove choice ${i + 1}`}
              disabled={q.choices.length <= 2}
              onClick={() => {
                const choices = q.choices.filter((c) => c.id !== choice.id);
                const remaining = q.correctChoiceIds.filter((id) => id !== choice.id);
                onChange({
                  ...q,
                  choices,
                  correctChoiceIds: remaining.length === 0 && !multi ? [choices[0]!.id] : remaining,
                });
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        );
      })}
      </div>
      {q.choices.length < 8 && (
        <Button
          variant="ghost"
          className="text-primary"
          onClick={() => onChange({ ...q, choices: [...q.choices, { id: newId(), text: "" }] })}
        >
          <Plus className="size-4" /> Add choice
        </Button>
      )}
    </div>
  );
}
