import { CodeTests } from "@/components/code-tests";
import { languageLabel } from "@examinus/question-kinds-core/code";
import type { ReviewProps } from "../views/review";
import { GradedCode, GradingReplay, RubricText } from "../shared/review-grading";
import { LiveCode } from "../shared/review-live";
import { PlainPrompt } from "../shared/review-prompt";
import { CodeResult, ResultFrame } from "../shared/review-result";

export function Review(props: ReviewProps<"code">) {
  switch (props.mode) {
    case "prompt":
      return <PlainPrompt q={props.q} urls={props.urls} />;
    case "result":
      return (
        <ResultFrame q={props.q} urls={props.urls} feedback={props.feedback}>
          <CodeResult q={props.q} answer={props.answer} />
        </ResultFrame>
      );
    case "grading": {
      const { q, answer, urls, grading } = props;
      const { codeResults, typing } = grading;
      return (
        <>
          {q.rubric && <RubricText rubric={q.rubric} urls={urls} />}
          <GradedCode answer={answer} language={q.language} />
          {typing && (
            <GradingReplay
              initial={q.starterCode}
              edits={typing}
              final={typeof answer === "string" ? answer : ""}
              language={q.language}
            />
          )}
          <div>
            <p className="mb-1.5 text-sm font-medium">
              Test cases{" "}
              <span className="font-normal text-muted">
                {codeResults
                  ? `· passed ${codeResults.filter((r) => r.passed).length} of ${q.tests.length}`
                  : "· not run yet: check the code against these by hand until the code runner is connected"}
              </span>
            </p>
            <CodeTests tests={q.tests} results={codeResults} />
          </div>
        </>
      );
    }
    case "live":
      return <LiveCode number={props.number} answer={props.answer} edits={props.edits} initial={props.q.starterCode} language={props.q.language} />;
    case "key": {
      const { q } = props;
      return (
        <p className="mt-2 text-sm text-success">
          {languageLabel[q.language]} · {q.tests.length} test {q.tests.length === 1 ? "case" : "cases"} (
          {q.tests.filter((t) => t.hidden).length} hidden)
        </p>
      );
    }
  }
}
