"use client";

import clsx from "clsx";
import { Plus, X } from "lucide-react";
import { ImageField, withImage } from "../shared/editor-image-field";
import { newId } from "@examinus/question-kinds-core/editor-shared";
import { Check2, InlineField } from "../shared/editor-fields";
import type { EditorProps } from "../views/editor";

const letter = (i: number) => String.fromCharCode(65 + i);

// The choices as students see them (same rows, letters and radio buttons or checkboxes as the exam page), written
// in place. The control marks the correct answer, tinted green; the picture and remove buttons show on hover.
export function Editor({ q, onChange }: EditorProps<"multiple_choice">) {
  const multi = q.multipleCorrect;
  // With pictures the choices sit in a grid, as they do on the exam page.
  const cards = q.choices.some((c) => c.imageId !== undefined);
  return (
    <div className="space-y-3">
      <Check2
        checked={multi}
        onChange={(multipleCorrect) =>
          onChange({
            ...q,
            multipleCorrect,
            correctChoiceIds: multipleCorrect ? q.correctChoiceIds : q.correctChoiceIds.slice(0, 1),
          })
        }
        hint={multi ? "Students see “Select all that apply”." : undefined}
      >
        More than one correct answer
      </Check2>
      <p className="text-xs text-muted">Click the {multi ? "boxes" : "circle"} to mark the correct answer.</p>
      <div className={clsx(cards ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "space-y-2")} role={multi ? "group" : "radiogroup"}>
        {q.choices.map((choice, i) => {
          const correct = q.correctChoiceIds.includes(choice.id);
          const setChoice = (patch: (c: typeof choice) => typeof choice) =>
            onChange({ ...q, choices: q.choices.map((c) => (c.id === choice.id ? patch(c) : c)) });
          return (
            <div
              key={choice.id}
              className={clsx(
                "group flex gap-3 rounded-lg border text-sm focus-within:border-primary",
                cards ? "flex-col p-3" : "items-center px-3 py-2",
                correct ? "border-success bg-success-soft" : "border-border hover:bg-surface-muted",
              )}
            >
              {choice.imageId !== undefined && (
                <ImageField
                  imageId={choice.imageId}
                  alt={choice.alt}
                  label={`choice ${letter(i)}`}
                  onChange={(picked) => setChoice((c) => withImage(c, picked))}
                />
              )}
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                  type="button"
                  role={multi ? "checkbox" : "radio"}
                  aria-checked={correct}
                  aria-label={`Mark choice ${letter(i)} correct`}
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
                    "grid size-4 shrink-0 place-items-center border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    multi ? "rounded-[4px]" : "rounded-full",
                    correct ? "border-success bg-success" : "border-border bg-surface hover:border-success",
                  )}
                >
                  {correct && <span className={clsx("block bg-white", multi ? "size-1.5 rounded-[1px]" : "size-1.5 rounded-full")} />}
                </button>
                <span className="font-medium text-muted">{letter(i)}.</span>
                <InlineField
                  bare
                  value={choice.text}
                  onChange={(text) => setChoice((c) => ({ ...c, text }))}
                  placeholder={`Choice ${letter(i)}`}
                  label={`Choice ${letter(i)}`}
                />
                <span className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                  {choice.imageId === undefined && (
                    <ImageField
                      compact
                      imageId={choice.imageId}
                      alt={choice.alt}
                      label={`choice ${letter(i)}`}
                      onChange={(picked) => setChoice((c) => withImage(c, picked))}
                    />
                  )}
                  <button
                    type="button"
                    aria-label={`Remove choice ${letter(i)}`}
                    disabled={q.choices.length <= 2}
                    className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-danger disabled:pointer-events-none disabled:opacity-40"
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
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {q.choices.length < 8 && (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-1 py-1 text-sm font-medium text-primary hover:underline"
          onClick={() => onChange({ ...q, choices: [...q.choices, { id: newId(), text: "" }] })}
        >
          <Plus className="size-4" /> Add choice
        </button>
      )}
    </div>
  );
}
