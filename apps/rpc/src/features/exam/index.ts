import { ExamHandlers } from "./Handlers.ts";
import { ExamRepo } from "./Repo.ts";
import { ExamService } from "./Service.ts";

// Exam mode: allowing a student back in, retakes and the exam record. The attempt feature reads granted retakes
// from ExamRepo.
export const Repo = ExamRepo.layer;
export const Services = ExamService.layer;
export const Live = ExamHandlers;
