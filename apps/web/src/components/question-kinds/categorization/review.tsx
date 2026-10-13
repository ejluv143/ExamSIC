import clsx from "clsx";
import { Markdown } from "@/components/markdown";
import { categorizationResults, parseCategorizationAnswer } from "@examinus/domain/placement";
import type { CategorizationQuestion } from "@examinus/domain/kinds/categorization";
import type { AnswerValue } from "@examinus/domain/quiz";
import type { ReviewProps } from "../views/review";
import { StudentAnswer } from "../shared/review-grading";
import { ItemView } from "../shared/review-items";
import { LiveText } from "../shared/review-live";
import { ItemContent, Mark } from "../shared/review-placement";
import { PlainPrompt } from "../shared/review-prompt";
import { ResultFrame } from "../shared/review-result";

export function Review(props: ReviewProps<"categorization">) {
  switch (props.mode) {
    case "prompt":
      return <PlainPrompt q={props.q} urls={props.urls} />;
    case "result":
      return (
        <ResultFrame q={props.q} urls={props.urls} feedback={props.feedback}>
          <CategorizationReview q={props.q} value={props.answer} assetUrls={props.urls} showKey />
        </ResultFrame>
      );
    case "grading": {
      const { q, answer, urls } = props;
      return (
        <StudentAnswer>
          <div className="space-y-1">
            <CategorizationReview q={q} value={answer} assetUrls={urls} showKey />
            <p className="text-xs text-muted">
              {categorizationResults(q, answer ?? null).filter((r) => r.correct).length} of {q.items.length} items in the right place
            </p>
          </div>
        </StudentAnswer>
      );
    }
    case "live":
      return <LiveText q={props.q} answer={props.answer} />;
    case "key": {
      const { q, urls } = props;
      return (
        <ul className="mt-2 space-y-1 text-sm text-success">
          {q.categories.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium">{c.name || "(unnamed)"}:</span>
              {q.items
                .filter((x) => x.categoryId === c.id)
                .map((x) => (
                  <ItemView key={x.id} item={x} urls={urls} />
                ))}
            </li>
          ))}
          {q.items.some((x) => x.categoryId === null) && (
            <li className="flex flex-wrap items-center gap-1.5 text-muted">
              <span className="font-medium">Left unsorted:</span>
              {q.items
                .filter((x) => x.categoryId === null)
                .map((x) => (
                  <ItemView key={x.id} item={x} urls={urls} />
                ))}
            </li>
          )}
        </ul>
      );
    }
  }
}

// The student's sorting: a box per category with the items they put there, then the items left unsorted.
function CategorizationReview({
  q,
  value,
  assetUrls,
  showKey,
}: {
  q: CategorizationQuestion;
  value?: AnswerValue;
  assetUrls: Record<string, string>;
  showKey: boolean;
}) {
  const results = categorizationResults(q, value ?? null);
  const given = parseCategorizationAnswer(value);
  const itemOf = (id: string) => q.items.find((i) => i.id === id);
  const categoryName = (id: string | null) => q.categories.find((c) => c.id === id)?.name;
  const boxes = [
    ...q.categories.map((c) => ({ id: c.id as string | null, name: c.name, description: c.description })),
    { id: null as string | null, name: "Unsorted", description: undefined },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {boxes.map((box) => {
        // Only items the student placed show in a category; the rest of the items are unsorted.
        const placed = results.filter((r) => (box.id === null ? r.given === null : r.given === box.id));
        return (
          <section key={box.id ?? "unsorted"} aria-label={box.name} className="rounded-md border border-border p-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{box.name}</h4>
            {box.description && (
              <Markdown className="text-xs text-muted" assetUrls={assetUrls}>
                {box.description}
              </Markdown>
            )}
            {placed.length === 0 ? (
              <p className="mt-1 text-xs italic text-muted">{box.id === null ? "Nothing left unsorted" : "Nothing here"}</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {placed.map((r) => {
                  const item = itemOf(r.itemId);
                  const right = item?.categoryId ?? null;
                  return (
                    <li
                      key={r.itemId}
                      className={clsx("flex items-start gap-2 rounded px-1.5 py-1", r.correct ? "bg-success-soft" : "bg-danger-soft")}
                    >
                      <Mark correct={r.correct} />
                      <ItemContent item={item} assetUrls={assetUrls} />
                      {showKey && !r.correct && (
                        <span className="shrink-0 text-xs text-success">
                          {right === null ? "Belongs nowhere (leave unsorted)" : `Belongs in ${categoryName(right) ?? "—"}`}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      <span className="sr-only">
        {results.filter((r) => r.correct).length} of {results.length} items in the right place
        {Object.keys(given).length === 0 && "; nothing was sorted"}
      </span>
    </div>
  );
}
