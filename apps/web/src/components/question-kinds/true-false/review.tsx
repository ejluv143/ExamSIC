import type { ReviewProps } from "../views/review";
import { KeyBox, GradedAnswer, StudentAnswer } from "../shared/review-grading";
import { LiveText } from "../shared/review-live";
import { PlainPrompt } from "../shared/review-prompt";
import { ResultFrame, ResultKey, YourAnswer } from "../shared/review-result";

export function Review(props: ReviewProps<"true_false">) {
  switch (props.mode) {
    case "prompt":
      return <PlainPrompt q={props.q} urls={props.urls} />;
    case "result":
      return (
        <ResultFrame q={props.q} urls={props.urls} feedback={props.feedback}>
          <YourAnswer q={props.q} answer={props.answer} urls={props.urls} />
          <ResultKey q={props.q} full={props.full} urls={props.urls} />
        </ResultFrame>
      );
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
    case "key":
      return <p className="mt-2 text-sm text-success">Answer: {props.q.answer ? "True" : "False"}</p>;
  }
}
