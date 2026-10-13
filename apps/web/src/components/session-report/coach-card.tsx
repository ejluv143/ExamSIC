"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";
import { getCoachAction } from "@/app/student/actions";
import type { CoachResult } from "@examinus/domain/analytics";

// A slow model must not leave the card waiting for ever: after this the rule-based report is shown.
const waitMs = 25_000;

type State = { status: "loading" } | { status: "ready"; source: CoachResult["source"]; report: CoachResult["report"] };

export function CoachCard({
  sessionId,
  fallback,
  practiceHref,
}: {
  sessionId: string;
  // The rule-based report, made on the server from the same numbers; shown whenever the AI coach can't answer.
  fallback: CoachResult["report"];
  practiceHref: string;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let settled = false;
    const settle = (next: State) => {
      if (settled) return;
      settled = true;
      setState(next);
    };
    const rules: State = { status: "ready", source: "rules", report: fallback };
    const timer = setTimeout(() => settle(rules), waitMs);
    getCoachAction(sessionId)
      .then((res) => settle("ok" in res ? { status: "ready", source: res.ok.source, report: res.ok.report } : rules))
      .catch(() => settle(rules))
      .finally(() => clearTimeout(timer));
    return () => {
      settled = true;
      clearTimeout(timer);
    };
  }, [sessionId, fallback]);

  return (
    <Card className="overflow-hidden border-primary/30 bg-linear-to-br from-primary-soft to-surface p-5 sm:p-7">
      {state.status === "loading" ? (
        <div role="status" aria-label="Your coach is reading your attempt" className="space-y-4 motion-safe:animate-pulse">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Sparkles className="size-4 text-primary" aria-hidden /> Your coach is reading your attempt…
          </div>
          <div className="h-7 w-2/3 rounded bg-surface-muted" />
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-surface-muted" />
            <div className="h-4 w-11/12 rounded bg-surface-muted" />
            <div className="h-4 w-4/5 rounded bg-surface-muted" />
          </div>
          <div className="h-4 w-3/5 rounded bg-surface-muted" />
        </div>
      ) : (
        <Report report={state.report} source={state.source} practiceHref={practiceHref} />
      )}
    </Card>
  );
}

function Report({
  report,
  source,
  practiceHref,
}: {
  report: CoachResult["report"];
  source: CoachResult["source"];
  practiceHref: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
          <Sparkles className="size-3" aria-hidden /> {source === "ai" ? "AI coach" : "Coach"}
        </span>
        <h2 className="text-xl font-semibold sm:text-2xl">{report.headline}</h2>
      </div>
      <div className="max-w-3xl space-y-3 text-sm leading-relaxed">
        {report.narrativeAssessment.split(/\n\s*\n/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <ul className="max-w-3xl space-y-1.5 text-sm">
        {report.primaryTakeaways.map((t, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
      {report.recommendedDrillTopic && (
        <ButtonLink href={`${practiceHref}?topic=${encodeURIComponent(report.recommendedDrillTopic)}`}>
          Generate recommended drill <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      )}
    </div>
  );
}
