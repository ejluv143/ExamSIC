// Tools that read sessions: the list, the results page's numbers, one question, the anti-cheating page.
import { median, topicTags } from "@examinus/domain/analytics";
import { answerKey, answerText } from "@examinus/domain/answer-text";
import { kindOf } from "@examinus/domain/kinds";
import { hasAnswer } from "@examinus/domain/quiz";
import { percent } from "@examinus/domain/scoring";
import type { McpServer } from "@modelcontextprotocol/server";
import { Schema } from "effect";
import { input, optional } from "../input.ts";
import { api } from "../api.ts";
import { earnedOn, integrityOf, loadSession, numberOf, scoreOf, topicTotals } from "../session-data.ts";
import { averagePercent, clip, fullName, mean, round1, round2, run, secondsOf } from "../util.ts";

type Status = "Graded" | "Needs grading" | "In progress" | "Not submitted";

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
        const { detail, session, attempts, questions, ids, names, latest } = await loadSession(sessionId);
        const integrity = integrityOf(questions, latest).attempts;
        const rows = ids.map((studentId) => {
          const mine = attempts.filter((d) => d.studentId === studentId);
          const last = latest.get(studentId);
          const score = last && scoreOf(questions, last);
          const status: Status = last ? (last.attempt.status === "graded" ? "Graded" : "Needs grading") : mine.length > 0 ? "In progress" : "Not submitted";
          const timeMs = last ? Date.parse(last.attempt.submittedAt!) - Date.parse(last.attempt.startedAt) : null;
          const level = last && integrity[last.attempt.id];
          const student = names.get(studentId);
          return {
            studentId,
            name: student ? fullName(student) : null,
            status,
            attempts: mine.length,
            score: score ? score.score : null,
            max: score ? score.max : null,
            percent: score ? percent(score.score, score.max) : null,
            ...(score && score.ungraded > 0 ? { ungradedQuestions: score.ungraded } : {}),
            timeSec: timeMs !== null && timeMs > 0 ? Math.round(timeMs / 1000) : null,
            integrity: level ? level.level : null,
            complete: !!score && score.ungraded === 0,
          };
        });
        rows.sort((a, b) => (a.name ?? a.studentId).localeCompare(b.name ?? b.studentId));

        const percents = rows.flatMap((r) => (r.complete && r.percent !== null ? [r.percent] : []));
        const bands = Array.from({ length: 10 }, () => 0);
        for (const p of percents) bands[Math.min(9, Math.floor(p / 10))]!++;
        const count = (s: Status) => rows.filter((r) => r.status === s).length;

        // Percent of the points earned per question, over the latest submitted attempts that had it (answers waiting
        // for a teacher are left out).
        const perQuestion = questions.map((q) => {
          const had = [...latest.values()].filter((d) => d.questionOrder.includes(q.id));
          const scores = had.flatMap((d) => {
            const s = earnedOn(q, d);
            return s === null ? [] : [s];
          });
          const times = had.flatMap((d) => d.answers.filter((a) => a.questionId === q.id && a.timeSpentMs !== undefined).map((a) => a.timeSpentMs!));
          const avgTime = mean(times);
          return {
            number: numberOf(questions, q.id),
            questionId: q.id,
            type: q.type,
            topic: q.topic ?? null,
            points: q.points,
            percentEarned: scores.length ? percent(scores.reduce((a, b) => a + b, 0), q.points * scores.length) : null,
            scored: scores.length,
            answered: had.filter((d) => hasAnswer(d.answers.find((a) => a.questionId === q.id)?.value ?? null)).length,
            meanTimeSec: secondsOf(avgTime),
          };
        });

        const topicMastery = [...topicTotals(questions, latest.values())]
          .filter(([, t]) => t.max > 0)
          .map(([topic, t]) => ({ topic, percent: percent(t.got, t.max), answers: t.answers, medianTimeSec: secondsOf(median(t.times)) }))
          .sort((a, b) => a.percent - b.percent);

        return {
          sessionId,
          quizTitle: detail.quiz.quiz.title,
          mode: session.mode,
          status: session.status,
          classId: session.classId,
          students: rows.map(({ complete: _complete, ...r }) => r),
          summary: {
            students: rows.length,
            submitted: latest.size,
            completedScores: percents.length,
            mean: averagePercent(percents),
            median: median(percents),
            highest: percents.length ? Math.max(...percents) : null,
            lowest: percents.length ? Math.min(...percents) : null,
            status: { graded: count("Graded"), needsGrading: count("Needs grading"), inProgress: count("In progress"), notSubmitted: count("Not submitted") },
            distribution: bands.map((n, i) => ({ band: `${i * 10}-${i === 9 ? 100 : i * 10 + 9}`, count: n })),
          },
          questions: perQuestion,
          topicMastery,
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
          number: numberOf(questions, q.id),
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
        const { questions, names, latest } = await loadSession(sessionId);
        const { attempts: byAttempt, pairs } = integrityOf(questions, latest);
        const owner = new Map([...latest.values()].map((d) => [d.attempt.id, d.studentId]));
        const label = (attemptId: string) => {
          const studentId = owner.get(attemptId) ?? attemptId;
          const s = names.get(studentId);
          return s ? fullName(s) : studentId;
        };
        const students = [...latest.values()].map((d) => {
          const result = byAttempt[d.attempt.id]!;
          return {
            studentId: d.studentId,
            name: names.get(d.studentId) ? fullName(names.get(d.studentId)!) : null,
            level: result.level,
            score: result.score,
            awayMin: round1(result.report.awayMs / 60000),
            signals: result.signals.slice(0, 3).map((s) => ({ label: s.label, points: s.points })),
          };
        });
        const rank = { high: 0, medium: 1, low: 2 } as const;
        students.sort((a, b) => rank[a.level] - rank[b.level] || b.score - a.score);
        return {
          sessionId,
          students,
          pairs: pairs.slice(0, 20).map((p) => ({
            kind: p.kind,
            students: [label(p.a), label(p.b)],
            strength: round2(p.strength),
            detail: p.detail,
            questions: p.questionIds.map((id) => numberOf(questions, id)),
          })),
        };
      }),
  );
}
