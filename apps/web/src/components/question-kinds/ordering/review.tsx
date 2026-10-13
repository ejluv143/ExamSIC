import clsx from "clsx";
import { orderingResults, parseOrderingAnswer } from "@examinus/domain/placement";
import type { OrderingQuestion } from "@examinus/domain/kinds/ordering";
import type { AnswerValue } from "@examinus/domain/quiz";
import type { ReviewProps } from "../views/review";
import { StudentAnswer } from "../shared/review-grading";
import { ItemView } from "../shared/review-items";
import { LiveText } from "../shared/review-live";
import { ItemContent, Mark } from "../shared/review-placement";
import { PlainPrompt } from "../shared/review-prompt";
import { ResultFrame } from "../shared/review-result";

export function Review(props: ReviewProps<"ordering">) {
  switch (props.mode) {
    case "prompt":
      return <PlainPrompt q={props.q} urls={props.urls} />;
    case "result":
      return (
        <ResultFrame q={props.q} urls={props.urls} feedback={props.feedback}>
          <OrderingReview q={props.q} value={props.answer} assetUrls={props.urls} showKey={!props.full} />
        </ResultFrame>
      );
    case "grading": {
      const { q, answer, urls } = props;
      return (
        <StudentAnswer>
          <div className="space-y-1">
            <OrderingReview q={q} value={answer} assetUrls={urls} showKey />
            <p className="text-xs text-muted">
              {orderingResults(q, answer ?? null).filter((r) => r.correct).length} of {q.items.length} in the right position
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
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-success">
          {q.items.map((x) => (
            <li key={x.id}>
              <ItemView item={x} urls={urls} />
            </li>
          ))}
        </ol>
      );
    }
  }
}

// The student's order as a numbered list with a mark per position; with the key, the correct order beside it.
function OrderingReview({
  q,
  value,
  assetUrls,
  showKey,
}: {
  q: OrderingQuestion;
  value?: AnswerValue;
  assetUrls: Record<string, string>;
  showKey: boolean;
}) {
  const order = parseOrderingAnswer(q, value ?? null);
  const results = orderingResults(q, value ?? null);
  const itemOf = (id: string) => q.items.find((i) => i.id === id);
  if (!order) return <p className="italic text-muted">No answer</p>;
  return (
    <div className={clsx("grid gap-3", showKey && "sm:grid-cols-2")}>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Your order</h4>
        <ol className="mt-1 space-y-1">
          {order.map((id, i) => (
            <li
              key={id}
              className={clsx("flex items-start gap-2 rounded px-1.5 py-1", results[i]?.correct ? "bg-success-soft" : "bg-danger-soft")}
            >
              <span className="w-5 shrink-0 text-right tabular-nums text-muted">{i + 1}.</span>
              <Mark correct={results[i]?.correct ?? false} />
              <ItemContent item={itemOf(id)} assetUrls={assetUrls} />
            </li>
          ))}
        </ol>
      </div>
      {showKey && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Correct order</h4>
          <ol className="mt-1 space-y-1">
            {q.items.map((item, i) => (
              <li key={item.id} className="flex items-start gap-2 rounded px-1.5 py-1">
                <span className="w-5 shrink-0 text-right tabular-nums text-muted">{i + 1}.</span>
                <ItemContent item={item} assetUrls={assetUrls} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
