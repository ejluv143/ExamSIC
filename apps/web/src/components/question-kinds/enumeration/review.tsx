import { partResults } from "@examinus/domain/scoring";
import type { ReviewProps } from "../views/review";
import { KeyBox, GradedAnswer, StudentAnswer } from "../shared/review-grading";
import { LiveText } from "../shared/review-live";
import { PlainPrompt } from "../shared/review-prompt";
import { PartsResult, ResultFrame, ResultKey, YourAnswer } from "../shared/review-result";

export function Review(props: ReviewProps<"enumeration">) {
  switch (props.mode) {
    case "prompt":
      return <PlainPrompt q={props.q} urls={props.urls} />;
    case "result": {
      const { q, answer, urls } = props;
      const parts = partResults(q, answer);
      return (
        <ResultFrame q={q} urls={urls} feedback={props.feedback}>
          {parts ? <PartsResult parts={parts} urls={urls} /> : <YourAnswer q={q} answer={answer} urls={urls} />}
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
          {q.orderMatters ? "In order: " : "Any order: "}
          {q.items.map((x) => x.split("|").join(" / ")).join(", ")}
        </p>
      );
    }
  }
}
