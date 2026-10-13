// What the question bank page works out from the list the API returns: where a question comes from, the filters
// (kept in the URL), the groups of the two views and the tags a teacher already uses.
import type { BankQuestion } from "@examinus/contract/bank";
import { questionTypes, type QuestionType } from "@examinus/domain/question";
import { plainText } from "@/components/question-kinds/shared/plain-text";

export type Source = "all" | "mine" | "shared" | "library";
export type View = "section" | "topic";

export const sourceLabel: Record<Source, string> = {
  all: "All",
  mine: "Mine",
  shared: "Shared with me",
  library: "Library",
};

// Where a question comes from: the shared library (no owner), the teacher's own, or another teacher's.
export const sourceOf = (b: BankQuestion): Exclude<Source, "all"> => (b.owner === null ? "library" : b.mine ? "mine" : "shared");

export type Filters = { view: View; q: string; subject: string; topic: string; type: QuestionType | ""; source: Source };

export const noFilters: Filters = { view: "section", q: "", subject: "", topic: "", type: "", source: "all" };

const sources = Object.keys(sourceLabel) as Source[];

// `?view=topic&subject=Math&source=mine`; anything unknown falls back to the default.
export function parseFilters(params: { get(name: string): string | null }): Filters {
  const type = params.get("type") ?? "";
  const source = params.get("source") ?? "";
  return {
    view: params.get("view") === "topic" ? "topic" : "section",
    q: params.get("q") ?? "",
    subject: params.get("subject") ?? "",
    topic: params.get("topic") ?? "",
    type: (questionTypes as readonly string[]).includes(type) ? (type as QuestionType) : "",
    source: (sources as string[]).includes(source) ? (source as Source) : "all",
  };
}

// The query string for `filters`, leaving out what is the default.
export function filtersToParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.view !== noFilters.view) params.set("view", filters.view);
  if (filters.q) params.set("q", filters.q);
  if (filters.subject) params.set("subject", filters.subject);
  if (filters.topic) params.set("topic", filters.topic);
  if (filters.type) params.set("type", filters.type);
  if (filters.source !== "all") params.set("source", filters.source);
  return params;
}

export const hasFilters = (f: Filters) => Boolean(f.q || f.subject || f.topic || f.type || f.source !== "all");

export function applyFilters(bank: readonly BankQuestion[], f: Filters): BankQuestion[] {
  const needle = f.q.trim().toLowerCase();
  return bank.filter(
    (b) =>
      (!f.subject || b.subject === f.subject) &&
      (!f.topic || b.topic === f.topic) &&
      (!f.type || b.question.type === f.type) &&
      (f.source === "all" || sourceOf(b) === f.source) &&
      (!needle ||
        [b.question.prompt, b.subject ?? "", b.topic ?? ""].some((text) => text.toLowerCase().includes(needle))),
  );
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

export const subjectsOf = (bank: readonly BankQuestion[]): string[] =>
  [...new Set(bank.flatMap((b) => (b.subject ? [b.subject] : [])))].sort(byName);

// Topics of the bank, or of one subject when given.
export const topicsOf = (bank: readonly BankQuestion[], subject = ""): string[] =>
  [...new Set(bank.flatMap((b) => (b.topic && (!subject || b.subject === subject) ? [b.topic] : [])))].sort(byName);

export const totalPoints = (items: readonly BankQuestion[]) => items.reduce((sum, b) => sum + b.question.points, 0);

// The first line of a prompt, as plain text.
export function firstLine(prompt: string): string {
  const line = prompt.split("\n").find((l) => plainText(l) !== "") ?? "";
  return plainText(line) || "(No text)";
}

export type Group = { key: string; label: string; items: BankQuestion[] };

// By Section: one group per question type, in the order of a test paper.
export function groupBySection(items: readonly BankQuestion[], label: (type: QuestionType) => string): Group[] {
  return questionTypes.flatMap((type) => {
    const inType = items.filter((b) => b.question.type === type);
    return inType.length ? [{ key: `type:${type}`, label: label(type), items: inType }] : [];
  });
}

export type TopicGroup = { key: string; label: string; subject: string | null; topic: string | null; items: BankQuestion[] };
export type SubjectGroup = { key: string; label: string; subject: string | null; items: BankQuestion[]; topics: TopicGroup[] };

export const untaggedLabel = "Untagged";
export const noTopicLabel = "No topic";

// By Topic: subject → topic. Questions without a subject sit under "Untagged" (by their topic, when they have
// one); a subject's questions without a topic sit under "No topic".
export function groupByTopic(items: readonly BankQuestion[]): SubjectGroup[] {
  const subjects = new Map<string | null, BankQuestion[]>();
  for (const b of items) subjects.set(b.subject, [...(subjects.get(b.subject) ?? []), b]);
  const order = [...subjects.keys()].sort((a, b) => (a === null ? 1 : b === null ? -1 : byName(a, b)));
  return order.map((subject) => {
    const inSubject = subjects.get(subject)!;
    const names = [...new Set(inSubject.map((b) => b.topic))].sort((a, b) => (a === null ? 1 : b === null ? -1 : byName(a, b)));
    const key = `subject:${subject ?? ""}`;
    return {
      key,
      label: subject ?? untaggedLabel,
      subject,
      items: inSubject,
      topics: names.map((topic) => ({
        key: `${key}/topic:${topic ?? ""}`,
        label: topic ?? (subject === null ? untaggedLabel : noTopicLabel),
        subject,
        topic,
        items: inSubject.filter((b) => b.topic === topic),
      })),
    };
  });
}

// The element id a group scrolls to from the side panel.
export const groupId = (key: string) => `bank-group-${key.replace(/[^A-Za-z0-9_-]/g, "_")}`;
