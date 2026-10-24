"use client";

import clsx from "clsx";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui";
import { ImageField, withImage } from "../shared/editor-image-field";
import { newId } from "../shared/editor-model";
import { Check2, InlineField } from "../shared/editor-fields";
import type { EditorProps } from "../views/editor";

export function Editor({ q, onChange }: EditorProps<"multiple_choice">) {
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
      >
        More than one correct answer
      </Check2>
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
              <div className="flex items-center gap-1">
                <InlineField
                  value={choice.text}
                  onChange={(text) => onChange({ ...q, choices: q.choices.map((c) => (c.id === choice.id ? { ...c, text } : c)) })}
                  placeholder={`Choice ${String.fromCharCode(65 + i)}`}
                  label={`Choice ${String.fromCharCode(65 + i)}`}
                />
                {choice.imageId === undefined && (
                  <ImageField
                    compact
                    imageId={choice.imageId}
                    alt={choice.alt}
                    label={`choice ${String.fromCharCode(65 + i)}`}
                    onChange={(picked) => onChange({ ...q, choices: q.choices.map((c) => (c.id === choice.id ? withImage(c, picked) : c)) })}
                  />
                )}
              </div>
              {choice.imageId !== undefined && (
                <ImageField
                  imageId={choice.imageId}
                  alt={choice.alt}
                  label={`choice ${String.fromCharCode(65 + i)}`}
                  onChange={(picked) => onChange({ ...q, choices: q.choices.map((c) => (c.id === choice.id ? withImage(c, picked) : c)) })}
                />
              )}
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
