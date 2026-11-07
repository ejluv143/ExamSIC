// Tools that read sessions: the list, the results page's numbers, one question, the anti-cheating page.
import { median } from "@examinus/domain/analytics";
import { answerKey, answerText } from "@examinus/domain/answer-text";
import { kindOf } from "@examinus/domain/kinds";
import { hasAnswer } from "@examinus/domain/quiz";
import { earnedOn, questionNumber, scoreOf, sessionResults } from "@examinus/domain/results";
import { integrityCaseFile } from "@examinus/domain/session-integrity";
import { percent } from "@examinus/domain/scoring";
import type { McpServer } from "@modelcontextprotocol/server";
import { Schema } from "effect";
import { input, optional } from "../input.ts";
import { api } from "../api.ts";
import { loadSession } from "../session-data.ts";
import { clip, fullName, mean, round1, round2, run, secondsOf } from "../util.ts";

export function registerAnalysis(server: McpServer) {
  server.registerTool(
    "list_sessions",
    {
      description: "The teacher's sessions (a quiz run for a class), optionally for one quiz or one class.",
      inputSchema: input({ quizId: optional(Schema.String), classId: optional(Schema.String) }),
    },
    ({ quizId, classId }) =>
      run(async () => {
        const list = await api((a) => a["session.list"]({ ...(quizId === undefined ? {} : { quizId }), ...(classId === undefined ? {} : { classId }) }));
        return list.map(({ session: s, quizTitle, studentCount, submittedCount, needsGrading }) => ({
          sessionId: s.id,
          quizId: s.quizId,
          quizTitle,
          classId: s.classId,
          mode: s.mode,
          status: s.status,
          opensAt: s.opensAt,
          closesAt: s.closesAt,
          studentCount,
          submittedCount,
          needsGrading,
        }));
      }),
  );

  server.registerTool(
    "session_results",
    {
      description:
        "The results page of a session in numbers: per student (latest submitted attempt) score, status, time and integrity level; summary with mean, median, highest, lowest, status breakdown and a 10% score distribution; per-question percent of points earned; topic mastery.",
      inputSchema: input({ sessionId: Schema.String }),
    },
    ({ sessionId }) =>
      run(async () => {
        const { detail, session, attempts, questions, ids, names } = await loadSession(sessionId);
        const results = sessionResults({ questions, studentIds: ids, attempts });
        const { summary } = results;
        const rows = results.rows.map(({ studentId, attempts: count, score, scorePercent, status, timeMs, integrity }) => {
          const student = names.get(studentId);
          return {
            studentId,
            name: student ? fullName(student) : null,
            status,
            attempts: count,
            score: score ? score.score : null,
            max: score ? score.max : null,
            percent: scorePercent,
            ...(score && score.ungraded > 0 ? { ungradedQuestions: score.ungraded } : {}),
            timeSec: timeMs === null ? null : Math.round(timeMs / 1000),
            integrity: integrity ? integrity.level : null,
          };
        });
        rows.sort((a, b) => (a.name ?? a.studentId).localeCompare(b.name ?? b.studentId));

        return {
          sessionId,
          quizTitle: detail.quiz.quiz.title,
          mode: session.mode,
          status: session.status,
          classId: session.classId,
          students: rows,
          summary: {
            students: summary.students,
            submitted: summary.submitted,
            completedScores: summary.percents.length,
            mean: summary.average,
            median: summary.median,
            highest: summary.highest,
            lowest: summary.lowest,
            status: {
              graded: summary.status.Graded,
              needsGrading: summary.status["Needs grading"],
              inProgress: summary.status["In progress"],
              notSubmitted: summary.status["Not submitted"],
            },
            distribution: summary.distribution.map((n, i) => ({ band: `${i * 10}-${i === 9 ? 100 : i * 10 + 9}`, count: n })),
          },
          questions: results.questions.map((t) => ({
            number: t.number,
            questionId: t.question.id,
            type: t.question.type,
            topic: t.question.topic ?? null,
            points: t.question.points,
            percentEarned: t.percent,
            scored: t.scored,
            answered: t.answered,
            meanTimeSec: secondsOf(t.meanTimeMs),
          })),
          topicMastery: results.topics.map(({ medianTimeMs, ...t }) => ({ ...t, medianTimeSec: secondsOf(medianTimeMs) })),
        };
      }),
  );

  server.registerTool(
    "question_analysis",
    {
      description:
        "One question of a session: percent fully correct, mean score, discrimination index (top vs bottom 27% by total score), answer split (choice counts, or the most common wrong answers as text), time taken and the answer key.",
      inputSchema: input({ sessionId: Schema.String, questionId: Schema.String }),
    },
    ({ sessionId, questionId }) =>
      run(async () => {
        const { questions, latest } = await loadSession(sessionId);
        const q = questions.find((x) => x.id === questionId);
        if (!q) throw new Error(`NotFound: question ${questionId} is not in this session's quiz.`);
        const taken = [...latest.values()].filter((d) => d.questionOrder.includes(q.id));
        const rows = taken.map((d) => {
          const answer = d.answers.find((a) => a.questionId === q.id);
          const total = scoreOf(questions, d);
          return { d, answer, earned: earnedOn(q, d), totalPercent: percent(total.score, total.max) };
        });
        const scored = rows.flatMap((r) => (r.earned === null ? [] : [{ ...r, earned: r.earned }]));

        const fraction = (r: { earned: number }) => (q.points === 0 ? 0 : r.earned / q.points);
        const byTotal = [...scored].sort((a, b) => b.totalPercent - a.totalPercent);
        const group = Math.max(1, Math.round(byTotal.length * 0.27));
        const top = byTotal.slice(0, group);
        const bottom = byTotal.slice(-group);
        const discrimination = byTotal.length >= 4 ? round2(mean(top.map(fraction))! - mean(bottom.map(fraction))!) : null;

        // The split: what each choice got for choice questions, else the commonest wrong answers in words.
        const given = rows.flatMap((r) => (r.answer && hasAnswer(r.answer.value) ? [r.answer.value!] : []));
        let split: unknown;
        if (q.type === "multiple_choice") {
          const picks = given.flatMap((v) => (Array.isArray(v) ? v : [String(v)]));
          split = {
            choices: q.choices.map((c) => ({ id: c.id, text: clip(c.text, 100), correct: q.correctChoiceIds.includes(c.id), count: picks.filter((p) => p === c.id).length })),
            noAnswer: rows.length - given.length,
          };
        } else if (q.type === "true_false") {
          split = { true: given.filter((v) => v === true).length, false: given.filter((v) => v === false).length, noAnswer: rows.length - given.length };
        } else {
          const wrong = new Map<string, { text: string; count: number }>();
          for (const r of scored) {
            if (r.earned >= q.points || !r.answer || !hasAnswer(r.answer.value)) continue;
            const text = clip(answerText(q, r.answer.value), 120);
            if (text === "") continue;
            const entry = wrong.get(text.toLowerCase()) ?? { text, count: 0 };
            entry.count++;
            wrong.set(text.toLowerCase(), entry);
          }
          split = {
            commonWrongAnswers: [...wrong.values()].sort((a, b) => b.count - a.count).slice(0, 5),
            noAnswer: rows.length - given.length,
          };
        }

        const times = rows.flatMap((r) => (r.answer?.timeSpentMs === undefined ? [] : [r.answer.timeSpentMs]));
        return {
          questionId: q.id,
          number: questionNumber(questions, q.id),
          type: q.type,
          topic: q.topic ?? null,
          points: q.points,
          prompt: clip(q.prompt, 300),
          answerKey: clip(answerKey(q), 300),
          students: rows.length,
          scored: scored.length,
          percentCorrect: scored.length ? percent(scored.filter((r) => r.earned >= q.points).length, scored.length) : null,
          meanScore: scored.length ? round2(mean(scored.map((r) => r.earned))!) : null,
          discrimination,
          split,
          meanTimeSec: secondsOf(mean(times)),
          medianTimeSec: secondsOf(median(times)),
          reviewable: kindOf(q).reviewable,
        };
      }),
  );

  server.registerTool(
    "integrity_summary",
    {
      description:
        "The anti-cheating page of a session: per student the integrity level, score and top signals, and the pair findings (shared wrong answers, similar text, timing, shared device or network). Typing analysis is not included.",
      inputSchema: input({ sessionId: Schema.String }),
    },
    ({ sessionId }) =>
      run(async () => {
        const { questions, names, attempts } = await loadSession(sessionId);
        const caseFile = integrityCaseFile({ questions, attempts });
        const label = (studentId: string) => {
          const s = names.get(studentId);
          return s ? fullName(s) : studentId;
        };
        return {
          sessionId,
          // Highest concern first.
          students: caseFile.students.map(({ studentId, integrity }) => ({
            studentId,
            name: names.get(studentId) ? fullName(names.get(studentId)!) : null,
            level: integrity.level,
            score: integrity.score,
            awayMin: round1(integrity.report.awayMs / 60000),
            signals: integrity.signals.slice(0, 3).map((s) => ({ label: s.label, points: s.points })),
          })),
          pairs: caseFile.findings.slice(0, 20).map((p) => ({
            kind: p.kind,
            students: [label(p.studentA), label(p.studentB)],
            strength: round2(p.strength),
            detail: p.detail,
            questions: p.numbers,
          })),
        };
      }),
  );
}
