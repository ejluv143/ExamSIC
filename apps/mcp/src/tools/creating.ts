// Tools that create content: question shapes, quizzes, questions in a quiz, questions in the bank.
import type { QuizDraft } from "@examinus/contract/quiz";
import { answerKey } from "@examinus/domain/answer-text";
import { kindOf } from "@examinus/domain/kinds";
import { questionTypes, type Question, type QuestionType } from "@examinus/domain/question";
import { subjectAreaNames } from "@examinus/domain/roles";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { api } from "../api.ts";
import { creatableTypes, decodeDrafts } from "../drafts.ts";
import { clip, run } from "../util.ts";

const draftNotes: Partial<Record<QuestionType, string>> = {
  multiple_choice: "3 to 5 choices (2 to 10 allowed), at least one but not all correct; several correct makes it a multiple-answer question.",
  true_false: "answer is true or false.",
  blank: "Identification: one answer box, so no {{blanks}} in the prompt; acceptedAnswers lists every accepted spelling.",
  enumeration: "At least 2 items; orderMatters true when the order is part of the answer.",
  numeric: "tolerance is an absolute margin (0 for exact); unit is optional text.",
  essay: "Graded by hand with the rubric; rubric points are scaled to the question's points.",
};

const commonFields = {
  points: "optional, whole or half number, default 1 (the essay rubric is scaled to it)",
  topic: 'optional; comma-separated tags such as "Data-Structures, Trees"; analytics group results by these tags',
  explanation: "optional markdown shown with the results",
};

const draftSchema = z.record(z.string(), z.unknown()).describe("A raw draft object in one of the shapes from question_shapes.");

function summarize(questions: readonly Question[]) {
  return questions.map((q) => ({ id: q.id, type: q.type, points: q.points, ...(q.topic ? { topic: q.topic } : {}), prompt: clip(q.prompt, 300), key: answerKey(q) }));
}

export function registerCreating(server: McpServer) {
  server.registerTool(
    "question_shapes",
    {
      description:
        "The raw draft JSON shape for every question type you can create with add_questions / add_bank_questions, plus the fields every draft accepts.",
      inputSchema: z.object({}),
    },
    () =>
      run(async () => ({
        creatable: creatableTypes.map((type) => ({ type, shape: kindOf({ type }).draft?.shape, note: draftNotes[type] ?? "" })),
        notCreatableHere: questionTypes.filter((t) => !creatableTypes.includes(t)),
        commonFields,
      })),
  );

  server.registerTool(
    "list_quizzes",
    { description: "The teacher's quizzes: id, title, subject, question count, total points and the sessions run from each.", inputSchema: z.object({}) },
    () =>
      run(async () => {
        const quizzes = await api((a) => a["quiz.list"]());
        return quizzes.map(({ quiz, questionCount, totalPoints, sessions }) => ({
          quizId: quiz.id,
          title: quiz.title,
          subject: quiz.subject,
          questionCount,
          totalPoints,
          sessions: sessions.map((s) => ({ sessionId: s.id, mode: s.mode, status: s.status, classId: s.classId })),
        }));
      }),
  );

  server.registerTool(
    "get_quiz",
    {
      description: "One quiz with its parts and questions, answer keys included (prompts are shortened to 300 characters).",
      inputSchema: z.object({ quizId: z.string() }),
    },
    ({ quizId }) =>
      run(async () => {
        const { quiz, parts } = await api((a) => a["quiz.get"]({ quizId }));
        return {
          quizId: quiz.id,
          title: quiz.title,
          description: clip(quiz.description, 300),
          subject: quiz.subject,
          subjectArea: quiz.subjectArea,
          parts: parts.map((p) => ({
            partId: p.id,
            title: p.title,
            ...(p.instructions ? { instructions: clip(p.instructions, 300) } : {}),
            questions: p.questions.map((q, i) => ({
              ...summarize([q])[0],
              number: i + 1,
              ...(q.type === "multiple_choice" ? { choices: q.choices.map((c) => ({ id: c.id, text: clip(c.text, 120), correct: q.correctChoiceIds.includes(c.id) })) } : {}),
            })),
          })),
        };
      }),
  );

  server.registerTool(
    "create_quiz",
    {
      description:
        "Creates an empty quiz (the letterhead and paper settings are copied from the teacher's latest quiz) and returns its id and part ids. Fill it with add_questions.",
      inputSchema: z.object({
        title: z.string().min(1),
        subject: z.string().optional().describe('Subject code, e.g. "IT302"'),
        subjectArea: z.enum(subjectAreaNames).optional(),
        description: z.string().optional().describe("Markdown"),
        parts: z.array(z.object({ title: z.string(), instructions: z.string().optional() })).optional().describe('Default: one part named "Questions"'),
      }),
    },
    ({ title, subject, subjectArea, description, parts }) =>
      run(async () => {
        const template = (await api((a) => a["quiz.list"]()))[0]?.quiz;
        const names = parts && parts.length > 0 ? parts : [{ title: "Questions" }];
        const draft: QuizDraft = {
          title: title.trim(),
          description: description ?? "",
          subject: subject ?? null,
          subjectArea: subjectArea ?? null,
          header: template
            ? { ...template.header, period: null, dates: "" }
            : { schoolLogoUrl: null, departmentLogoUrl: null, school: "", schoolAddress: "", department: "", semester: "first", academicYear: "", period: null, dates: "" },
          paper: template
            ? structuredClone(template.paper)
            : { size: "long", answerSheet: false, instructor: "", generalInstructions: [], footer: { documentNo: "", effectivityDate: "", revisionNo: "", member: "", motto: "" } },
          settings: { shuffleQuestions: false, shuffleChoices: false, shuffleParts: false },
          parts: names.map((p, i) => ({
            id: `new-part-${i}`,
            title: p.title.trim() || `Part ${i + 1}`,
            instructions: "instructions" in p ? (p.instructions ?? "") : "",
            shuffleQuestions: false,
            poolSize: null,
            questions: [],
          })),
        };
        const { quizId } = await api((a) => a["quiz.save"]({ draft }));
        const saved = await api((a) => a["quiz.get"]({ quizId }));
        return { quizId, parts: saved.parts.map((p) => ({ partId: p.id, title: p.title })) };
      }),
  );

  server.registerTool(
    "add_questions",
    {
      description:
        "Appends questions to a quiz part (the first part when partId is omitted). Each draft is decoded by its question type; drafts that don't hold up are returned in `rejected` with the reason and the rest are saved. Fails with QuizInUse once students have attempts and the change would alter grades.",
      inputSchema: z.object({ quizId: z.string(), partId: z.string().optional(), questions: z.array(draftSchema).min(1).max(50) }),
    },
    ({ quizId, partId, questions }) =>
      run(async () => {
        const { quiz, parts } = await api((a) => a["quiz.get"]({ quizId }));
        const target = partId === undefined ? parts[0] : parts.find((p) => p.id === partId);
        if (!target) throw new Error(partId === undefined ? "The quiz has no parts." : `NotFound: the quiz has no part ${partId}.`);
        const { questions: decoded, rejected } = decodeDrafts(questions);
        if (decoded.length === 0) return { quizId, partId: target.id, added: [], rejected };
        const draft: QuizDraft = {
          id: quiz.id,
          title: quiz.title,
          description: quiz.description,
          subject: quiz.subject,
          subjectArea: quiz.subjectArea,
          header: quiz.header,
          paper: quiz.paper,
          settings: quiz.settings,
          parts: parts.map(({ id, title, instructions, shuffleQuestions, poolSize, questions: existing }) => ({
            id,
            title,
            instructions,
            shuffleQuestions,
            poolSize,
            questions: id === target.id ? [...existing, ...decoded] : existing,
          })),
        };
        await api((a) => a["quiz.save"]({ draft }));
        // New questions get fresh ids on save: they are the last ones of the part, in order.
        const saved = (await api((a) => a["quiz.get"]({ quizId }))).parts.find((p) => p.id === target.id);
        const added = (saved?.questions ?? []).slice(-decoded.length);
        return { quizId, partId: target.id, added: summarize(added), rejected };
      }),
  );

  server.registerTool(
    "add_bank_questions",
    {
      description:
        "Adds questions to the teacher's question bank. `tags` become the questions' topic (analytics tags). Drafts that don't hold up are returned in `rejected`.",
      inputSchema: z.object({ questions: z.array(draftSchema).min(1).max(50), tags: z.array(z.string().min(1)).optional() }),
    },
    ({ questions, tags }) =>
      run(async () => {
        const { questions: decoded, rejected } = decodeDrafts(questions);
        if (decoded.length === 0) return { added: [], rejected };
        const topic = tags && tags.length > 0 ? tags.join(", ") : undefined;
        const { questionIds } = await api((a) => a["bank.add"]({ questions: decoded, ...(topic === undefined ? {} : { topic }) }));
        return { added: questionIds.map((id, i) => ({ id, type: decoded[i]?.type, prompt: clip(decoded[i]?.prompt ?? "", 120) })), rejected };
      }),
  );
}
