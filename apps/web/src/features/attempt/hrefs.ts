// Where a quiz or exam is taken: students under /student with their navigation, guests (anonymous accounts from
// /join) under /play with only a way out. The pages and the redirects in the data layer agree through this.
export type PlayerArea = "student" | "guest";

export type AttemptHrefs = {
  // The list of quizzes and exams; guests have none, their layout has Leave.
  list: string | null;
  take: string;
  result: string;
  practice: string;
  game: string;
};

export function attemptHrefs(area: PlayerArea, sessionId: string): AttemptHrefs {
  const id = encodeURIComponent(sessionId);
  const take = area === "student" ? `/student/assessments/${id}` : `/play/${id}/take`;
  return {
    list: area === "student" ? "/student/assessments" : null,
    take,
    result: `${take}/result`,
    practice: `${take}/practice`,
    game: area === "student" ? `/student/game/${id}` : `/play/${id}`,
  };
}
