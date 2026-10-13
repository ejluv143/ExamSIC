import { Markdown } from "@/components/markdown";
import type { ReviewProps } from "../views/review";
import { GradedCode, GradingReplay } from "../shared/review-grading";
import { LiveCode } from "../shared/review-live";
import { PlainPrompt } from "../shared/review-prompt";
import { CodeResult, ResultFrame } from "../shared/review-result";
import { SqlChecks } from "./sql-checks";

export function Review(props: ReviewProps<"sql">) {
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
          <div className="space-y-2 rounded-lg bg-info-soft p-3 text-sm">
            <p className="font-medium text-info">Answer query</p>
            <pre className="overflow-auto font-mono text-xs whitespace-pre-wrap">{q.answerSql}</pre>
            {q.rubric && <Markdown assetUrls={urls}>{q.rubric}</Markdown>}
          </div>
          <GradedCode answer={answer} language="sql" />
          <SqlChecks results={codeResults} />
          {typing && (
            <GradingReplay initial={q.starterCode} edits={typing} final={typeof answer === "string" ? answer : ""} language="sql" />
          )}
        </>
      );
    }
    case "live":
      return <LiveCode number={props.number} answer={props.answer} edits={props.edits} initial={props.q.starterCode} language="sql" />;
    case "key": {
      const { q } = props;
      return (
        <p className="mt-2 text-sm text-success">
          SQL{q.hiddenDataSql.trim() ? " · with hidden data check" : ""}
          {q.orderMatters ? " · order matters" : ""}
        </p>
      );
    }
  }
}
