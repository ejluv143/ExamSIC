import clsx from "clsx";
import { Markdown } from "@/components/markdown";
import { blankKey } from "@examinus/domain/kinds/blank";
import { partResults } from "@examinus/domain/scoring";
import type { ReviewProps } from "../views/review";
import { KeyBox, GradedAnswer, StudentAnswer } from "../shared/review-grading";
import { LiveText } from "../shared/review-live";
import { ResultFrame, ResultKey, YourAnswer } from "../shared/review-result";

export function Review(props: ReviewProps<"blank">) {
  switch (props.mode) {
    case "prompt": {
      // Blanks are filled in the sentence itself, so they are drawn with the prompt.
      const { q, answer, urls } = props;
      const parts = partResults(q, answer);
      return (
        <Markdown
          className="min-w-0 flex-1"
          assetUrls={urls}
          renderBlank={(b, { answers }) => {
            const part = parts?.[b];
            return (
              <span
                className={clsx(
                  "mx-0.5 inline-block rounded px-1.5 font-medium",
                  part?.correct ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
                )}
              >
                {part?.given || "—"}
                {!part?.correct && <span className="ml-1 text-success">({answers[0]})</span>}
              </span>
            );
          }}
        >
          {q.prompt}
        </Markdown>
      );
    }
    case "result": {
      const { q, answer, urls } = props;
      const parts = partResults(q, answer);
      return (
        <ResultFrame q={q} urls={urls} feedback={props.feedback}>
          {!parts && <YourAnswer q={q} answer={answer} urls={urls} />}
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
      const { q } = props;
      return (
        <p className="mt-2 text-sm text-success">
          Blanks:{" "}
          {blankKey(q).map((a, i) => `${i + 1}) ${a.join(" / ")}`).join("  ")}
        </p>
      );
    }
  }
}
