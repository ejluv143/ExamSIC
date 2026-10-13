import { answerText } from "@examinus/domain/answer-text";
import type { ReviewProps } from "../views/review";
import { GradedAnswer, RubricTicks, StudentAnswer } from "../shared/review-grading";
import { LiveReplay, LiveText } from "../shared/review-live";
import { PlainPrompt } from "../shared/review-prompt";
import { EssayResult, ResultFrame } from "../shared/review-result";
import { AiDraft } from "./ai-draft";

export function Review(props: ReviewProps<"essay">) {
  switch (props.mode) {
    case "prompt":
      return <PlainPrompt q={props.q} urls={props.urls} />;
    case "result":
      return (
        <ResultFrame q={props.q} urls={props.urls} feedback={props.feedback}>
          <EssayResult q={props.q} answer={props.answer} urls={props.urls} />
        </ResultFrame>
      );
    case "grading": {
      const { q, answer, urls, grading } = props;
      return (
        <>
          <RubricTicks q={q} rubric={q.rubric} urls={urls} grading={grading} />
          <StudentAnswer>
            <GradedAnswer q={q} answer={answer} urls={urls} />
          </StudentAnswer>
          {grading.ai.options.length > 0 && (
            <AiDraft
              question={q}
              hasAnswer={answerText(q, answer).trim() !== ""}
              ai={grading.ai}
              onApply={(s) => {
                grading.setTicked(new Set(s.rubricRowIds.filter((id) => q.rubric.some((r) => r.id === id))));
                grading.setPoints(String(Math.min(q.points, Math.max(0, s.score))));
                grading.setFeedback(s.feedback);
              }}
            />
          )}
        </>
      );
    }
    case "live":
      return (
        <>
          <LiveText q={props.q} answer={props.answer} />
          {props.edits && props.edits.length > 0 && (
            <LiveReplay
              initial=""
              edits={props.edits}
              final={typeof props.answer === "string" ? props.answer : ""}
              language="sql"
            />
          )}
        </>
      );
    case "key": {
      const { q } = props;
      return (
        <p className="mt-2 text-sm text-muted">
          Rubric: {q.rubric.length ? q.rubric.map((r) => `${r.criterion} (${r.points})`).join("; ") : "—"}
        </p>
      );
    }
  }
}
