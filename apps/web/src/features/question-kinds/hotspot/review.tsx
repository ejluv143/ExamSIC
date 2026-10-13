import { HotspotView } from "@/components/hotspot-view";
import { hotspotResults, parseHotspotAnswer } from "@examinus/domain/placement";
import type { HotspotQuestion } from "@examinus/domain/kinds/hotspot";
import type { AnswerValue } from "@examinus/domain/quiz";
import type { ReviewProps } from "../views/review";
import { StudentAnswer } from "../shared/review-grading";
import { LiveText } from "../shared/review-live";
import { PlainPrompt } from "../shared/review-prompt";
import { ResultFrame } from "../shared/review-result";

export function Review(props: ReviewProps<"hotspot">) {
  switch (props.mode) {
    case "prompt":
      return <PlainPrompt q={props.q} urls={props.urls} />;
    case "result":
      return (
        <ResultFrame q={props.q} urls={props.urls} feedback={props.feedback}>
          <HotspotReview q={props.q} value={props.answer} assetUrls={props.urls} />
        </ResultFrame>
      );
    case "grading":
      return (
        <StudentAnswer>
          <HotspotReview q={props.q} value={props.answer} assetUrls={props.urls} />
        </StudentAnswer>
      );
    case "live":
      return <LiveText q={props.q} answer={props.answer} />;
    case "key": {
      const { q, urls } = props;
      return (
        <div className="mt-2 space-y-1 text-sm text-success">
          <p>
            {q.regions.length} {q.regions.length === 1 ? "area" : "areas"} · up to {q.maxClicks} {q.maxClicks === 1 ? "click" : "clicks"}
          </p>
          <HotspotView imageId={q.imageId} alt={q.alt} assetUrls={urls} regions={q.regions} tolerance={q.tolerance} className="max-w-sm" />
        </div>
      );
    }
  }
}

// The student's clicks on the picture with the correct areas outlined, and how many areas they found.
function HotspotReview({
  q,
  value,
  assetUrls,
}: {
  q: HotspotQuestion;
  value?: AnswerValue;
  assetUrls: Record<string, string>;
}) {
  const markers = parseHotspotAnswer(value);
  if (markers.length === 0) return <p className="italic text-muted">No answer</p>;
  const { hit, outside } = hotspotResults(q, markers);
  return (
    <div className="space-y-1">
      <HotspotView
        imageId={q.imageId}
        alt={q.alt}
        assetUrls={assetUrls}
        markers={markers}
        regions={q.regions}
        tolerance={q.tolerance}
        className="max-w-lg"
      />
      <p className="text-xs text-muted">
        {hit.filter(Boolean).length} of {q.regions.length} areas found
        {outside > 0 && `; ${outside} ${outside === 1 ? "click" : "clicks"} outside every area`}
      </p>
    </div>
  );
}
