import { ArrowLeft, ArrowRight } from "lucide-react";
import clsx from "clsx";
import type { Paper } from "@examinus/contract/attempt";
import { Button } from "@/components/ui";

// The buttons under the questions: unanswered count, Previous/Next when they come one at a time, and the way to the
// review screen. `go` moves to a question (0-based).
export function NavFooter({
  hidden,
  progress,
  navigation,
  isLast,
  backToFurthest,
  nextBlocked,
  unanswered,
  moving,
  onGo,
  onReview,
}: {
  hidden: boolean;
  progress: Paper["progress"];
  navigation: Paper["session"]["navigation"];
  isLast: boolean;
  // On a question they went back to: the way on is the furthest question reached.
  backToFurthest: boolean;
  nextBlocked: string | null;
  // Unanswered questions of a paper on one page; 0 hides the count.
  unanswered: number;
  moving: boolean;
  onGo: (index: number) => void;
  onReview: () => void;
}) {
  const sequential = progress !== null;
  return (
    <div className={clsx("mt-6 flex flex-wrap items-center justify-end gap-3", hidden && "hidden")}>
      {unanswered > 0 && <span className="text-sm text-muted">{unanswered} unanswered</span>}
      {progress && navigation === "free" && progress.index > 0 && (
        <Button variant="secondary" onClick={() => onGo(progress.index - 1)} disabled={moving}>
          <ArrowLeft className="size-4" aria-hidden /> Previous
        </Button>
      )}
      {progress && backToFurthest ? (
        <Button onClick={() => onGo(progress.furthest)} disabled={moving}>
          {moving ? "Loading…" : `Back to question ${progress.furthest + 1}`} <ArrowRight className="size-4" aria-hidden />
        </Button>
      ) : (
        progress &&
        !isLast && (
          <Button onClick={() => onGo(progress.index + 1)} disabled={moving || nextBlocked !== null}>
            {moving ? "Loading…" : "Next question"} <ArrowRight className="size-4" aria-hidden />
          </Button>
        )
      )}
      {(!sequential || isLast) && (
        <Button onClick={onReview} variant={backToFurthest ? "secondary" : "primary"}>
          Review and submit
        </Button>
      )}
    </div>
  );
}
