import { AiHandlers } from "./Handlers.ts";
import { AiRepo } from "./Repo.ts";
import { Ai } from "./Service.ts";

// The ai.* RPCs; `Ai` is also used by attempt.coach.
export const Repo = AiRepo.layer;
export const Services = Ai.layer;
export const Live = AiHandlers;
