import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { AlertChip, IntegrityLevelBadge } from "@/components/integrity-chip";
import { PrintButton } from "@/components/print-button";
import { ButtonDownload, ButtonLink } from "@/components/ui";
import { getAttemptReport } from "@/lib/data/reports";
import { formatDuration, integrityEventLabel } from "@/lib/integrity";
import { fullName, questionLabel } from "@/lib/format";
import { answerHistoryRows, attemptIncidents, formatStamp, gradeChangeRows, reportTimeline, shortPrompt } from "@/lib/report-view";
import { percent } from "@examora/contract/scoring";

export const metadata: Metadata = { title: "Integrity report" };

const sectionTitle = "mb-2 mt-6 break-after-avoid border-b border-black/30 pb-1 text-base font-bold";
const th = "border border-black/30 bg-neutral-100 px-2 py-1 text-left font-semibold";
const td = "border border-black/30 px-2 py-1 align-top";

const minutes = (ms: number) => (ms > 0 ? formatDuration(ms) : "0");

// One student's record of an exam, to print or save as PDF: who and which paper, what the checks noticed, what
// the teacher did, every saved version of each answer and every score change after release.
export default async function IntegrityReportPage(
  props: PageProps<"/teacher/assessments/[quizId]/sessions/[sessionId]/report/[attemptId]">,
) {
  const { quizId, sessionId, attemptId } = await props.params;
  const r = await getAttemptReport(quizId, sessionId, attemptId);
  if (!r) notFound();
  const { attempt } = r.record.detail;
  const name = r.student ? fullName(r.student) : "Unknown student";
  const base = `/teacher/assessments/${quizId}/sessions/${sessionId}`;
  const timeline = reportTimeline(r, name);
  const incidents = attemptIncidents(r, name);
  const history = answerHistoryRows(r);
  const changes = gradeChangeRows(r);

  const facts: [string, string][] = [
    ["Student", name],
    ["Student no.", r.student?.studentNumber ?? "—"],
    ["Assessment", r.quiz.quiz.title],
    ["Paper version", r.version],
    ["Honor pledge accepted", attempt.pledgeAcceptedAt ? formatStamp(attempt.pledgeAcceptedAt) : "Not recorded"],
    ["Started", formatStamp(attempt.startedAt)],
    ["Submitted", attempt.submittedAt ? formatStamp(attempt.submittedAt) : "Not submitted"],
    ["IP address", r.record.detail.ip ?? "—"],
    ["Device", r.record.detail.deviceId ?? "—"],
    ["Score", `${r.score.score} / ${r.score.max} (${percent(r.score.score, r.score.max)}%)${r.score.ungraded > 0 ? ", still being graded" : ""}`],
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <ButtonLink href={`${base}/integrity`} variant="ghost">
          ← Anti-cheating
        </ButtonLink>
        <div className="flex flex-wrap gap-2">
          <ButtonDownload href={`${base}/report/${attemptId}/export`}>
            <Download className="size-4" aria-hidden /> Export Excel
          </ButtonDownload>
          <PrintButton label="Print / Save as PDF" />
        </div>
      </div>

      <article className="mx-auto max-w-[8.5in] bg-white p-8 text-[10.5pt] text-black shadow-sm ring-1 ring-black/10 print:max-w-none print:p-0 print:shadow-none print:ring-0">
        <header className="border-b-2 border-black pb-2">
          <h1 className="text-xl font-bold">Integrity report</h1>
          <p className="text-sm">
            {r.quiz.quiz.title} · {name}
          </p>
        </header>

        <dl className="mt-4 grid grid-cols-[10rem_1fr] gap-x-4 gap-y-1 break-inside-avoid">
          {facts.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="font-semibold">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
          <dt className="font-semibold">Integrity level</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <IntegrityLevelBadge level={r.level} />
            {r.signals.map((s) => (
              <span key={s.key} className="text-xs">
                {s.label} (+{s.points})
              </span>
            ))}
          </dd>
        </dl>

        <h2 className={sectionTitle}>What the checks noticed</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4 print:grid-cols-4">
          {(
            [
              ["Away (other tabs or apps)", minutes(r.report.awayMs)],
              ["Out of full screen", minutes(r.report.fullscreenMs)],
              ["Disconnected", minutes(r.report.disconnectedMs)],
              ["Longest gap", minutes(r.report.longestGapMs)],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded border border-black/30 p-2">
              <dt className="text-xs">{label}</dt>
              <dd className="text-base font-bold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        {r.report.byType.length === 0 ? (
          <p className="mt-2 text-sm">Nothing was recorded.</p>
        ) : (
          <table className="mt-3 w-full border-collapse text-sm break-inside-avoid">
            <thead>
              <tr>
                <th className={th}>Event</th>
                <th className={`${th} text-right`}>Count</th>
                <th className={`${th} text-right`}>Total time</th>
              </tr>
            </thead>
            <tbody>
              {r.report.byType.map((t) => (
                <tr key={t.type}>
                  <td className={td}>
                    <span className="mr-2 inline-block align-middle print:hidden">
                      <AlertChip type={t.type} />
                    </span>
                    <span title={integrityEventLabel[t.type]}>{integrityEventLabel[t.type]}</span>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{t.count}</td>
                  <td className={`${td} text-right tabular-nums`}>{t.totalMs > 0 ? formatDuration(t.totalMs) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2 className={sectionTitle}>Timeline</h2>
        {timeline.length === 0 ? (
          <p className="text-sm">No events and no actions by the teacher.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>Time</th>
                <th className={th}>Source</th>
                <th className={th}>What happened</th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((row, i) => (
                <tr key={`${row.at}-${i}`} className="break-inside-avoid">
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{formatStamp(row.at)}</td>
                  <td className={td}>{row.source}</td>
                  <td className={td}>{row.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2 className={sectionTitle}>The teacher&apos;s actions</h2>
        {incidents.length === 0 ? (
          <p className="text-sm">The teacher did nothing on this attempt.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {incidents.map(({ incident, text }) => (
              <li key={incident.id} className="break-inside-avoid">
                <span className="tabular-nums">{formatStamp(incident.at)}</span> — {text}
              </li>
            ))}
          </ul>
        )}

        <h2 className={`${sectionTitle} print:break-before-page`}>Answer history</h2>
        <p className="mb-2 text-sm">Every version of each answer that was saved, oldest first.</p>
        {history.length === 0 ? (
          <p className="text-sm">No answers were saved.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>Saved at</th>
                <th className={th}>Question</th>
                <th className={th}>Answer</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={`${h.at}-${i}`} className="break-inside-avoid">
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{formatStamp(h.at)}</td>
                  <td className={td}>
                    <span className="font-semibold">{h.number ? `Q${h.number}` : "Question"}</span>
                    {h.question && (
                      <span className="block text-xs">
                        {questionLabel(h.question)} · {shortPrompt(h.question, 60)}
                      </span>
                    )}
                  </td>
                  <td className={`${td} whitespace-pre-wrap break-words`}>{h.answer || "(blank)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2 className={sectionTitle}>Grade changes after release</h2>
        {changes.length === 0 ? (
          <p className="text-sm">No score was changed after the results were released.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>Time</th>
                <th className={th}>Question</th>
                <th className={`${th} text-right`}>From</th>
                <th className={`${th} text-right`}>To</th>
                <th className={th}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.id} className="break-inside-avoid">
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{formatStamp(c.at)}</td>
                  <td className={td}>{c.number ? `Q${c.number}` : "—"}</td>
                  <td className={`${td} text-right tabular-nums`}>{c.oldScore ?? "—"}</td>
                  <td className={`${td} text-right tabular-nums`}>{c.newScore ?? "—"}</td>
                  <td className={`${td} break-words`}>{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </>
  );
}
