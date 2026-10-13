import clsx from "clsx";
import { AssetImage } from "@/features/assets/components/asset-image";
import type { ReviewProps } from "../views/review";
import { KeyBox, GradedAnswer, StudentAnswer } from "../shared/review-grading";
import { ItemView } from "../shared/review-items";
import { LiveText } from "../shared/review-live";
import { PlainPrompt } from "../shared/review-prompt";
import { ResultFrame, ResultKey, YourAnswer } from "../shared/review-result";

export function Review(props: ReviewProps<"multiple_choice">) {
  switch (props.mode) {
    case "prompt":
      return <PlainPrompt q={props.q} urls={props.urls} />;
    case "result": {
      const { q, answer, urls } = props;
      return (
        <ResultFrame q={q} urls={urls} feedback={props.feedback}>
          <YourAnswer q={q} answer={answer} urls={urls}>
            <div className="mt-1 flex flex-wrap gap-2">
              {q.choices
                .filter((c) => c.imageId && (Array.isArray(answer) ? answer : [answer]).includes(c.id))
                .map((c) => (
                  <AssetImage key={c.id} id={c.imageId!} alt={c.alt ?? ""} assetUrls={urls} className="max-h-32" />
                ))}
            </div>
          </YourAnswer>
          <ResultKey q={q} full={props.full} urls={urls} />
        </ResultFrame>
      );
    }
    case "grading":
      return (
        <>
          <KeyBox q={props.q} urls={props.urls} />
          <StudentAnswer>
            <GradedAnswer q={props.q} answer={props.answer} urls={props.urls} />
          </StudentAnswer>
        </>
      );
    case "live":
      return <LiveText q={props.q} answer={props.answer} />;
    case "key": {
      const { q, urls } = props;
      return (
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {q.choices.map((c, i) => (
            <li
              key={c.id}
              className={clsx(
                "flex items-start gap-1 rounded-md px-2 py-1",
                q.correctChoiceIds.includes(c.id) ? "bg-success-soft font-medium text-success" : "text-muted",
              )}
            >
              {String.fromCharCode(65 + i)}. <ItemView item={c} urls={urls} />
            </li>
          ))}
        </ul>
      );
    }
  }
}
