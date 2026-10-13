import { Markdown } from "@/components/markdown";
import { partResults } from "@examinus/domain/scoring";
import type { ReviewProps } from "../views/review";
import { KeyBox, GradedAnswer, StudentAnswer } from "../shared/review-grading";
import { ItemView } from "../shared/review-items";
import { LiveText } from "../shared/review-live";
import { PlainPrompt } from "../shared/review-prompt";
import { PartsResult, ResultFrame, YourAnswer } from "../shared/review-result";

export function Review(props: ReviewProps<"matching">) {
  switch (props.mode) {
    case "prompt":
      return <PlainPrompt q={props.q} urls={props.urls} />;
    case "result": {
      const { q, answer, urls } = props;
      const parts = partResults(q, answer);
      return (
        <ResultFrame q={q} urls={urls} feedback={props.feedback}>
          {parts ? (
            <PartsResult
              parts={parts}
              urls={urls}
              prefix={(k) => (
                <>
                  <Markdown inline assetUrls={urls}>{q.left[k]?.text ?? ""}</Markdown>
                  <span className="text-muted"> → </span>
                </>
              )}
              hint={(k) => (
                <span className="text-success">
                  {" "}
                  (<Markdown inline assetUrls={urls}>{q.right.find((r) => r.id === q.left[k]?.rightId)?.text ?? ""}</Markdown>)
                </span>
              )}
            />
          ) : (
            <YourAnswer q={q} answer={answer} urls={urls} />
          )}
        </ResultFrame>
      );
    }
    case "grading": {
      const { q, urls } = props;
      return (
        <>
          <KeyBox q={q} urls={urls} />
          <StudentAnswer>
            <GradedAnswer
              q={q}
              answer={props.answer}
              urls={urls}
              prefix={(i) => (
                <>
                  <Markdown inline assetUrls={urls}>{q.left[i]?.text ?? ""}</Markdown> →
                </>
              )}
            />
          </StudentAnswer>
        </>
      );
    }
    case "live":
      return <LiveText q={props.q} answer={props.answer} />;
    case "key": {
      const { q, urls } = props;
      return (
        <ul className="mt-2 space-y-1 text-sm text-success">
          {q.left.map((l) => {
            const match = q.right.find((r) => r.id === l.rightId);
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-1.5">
                <ItemView item={l} urls={urls} /> → {match && <ItemView item={match} urls={urls} />}
              </li>
            );
          })}
        </ul>
      );
    }
  }
}
