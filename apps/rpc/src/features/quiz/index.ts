import { QuizHandlers } from "./Handlers.ts";
import { QuizRepo } from "./Repo.ts";
import { QuizService } from "./Service.ts";

// The quiz.* RPCs; `QuizRepo` is also how session, attempt, live, game and mastery read quizzes.
export const Repo = QuizRepo.layer;
export const Services = QuizService.layer;
export const Live = QuizHandlers;
