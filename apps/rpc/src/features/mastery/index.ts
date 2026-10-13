import { MasteryHandlers } from "./Handlers.ts";
import { MasteryRepo } from "./Repo.ts";
import { MasteryService } from "./Service.ts";

// Mastery mode: attempt.masteryState and attempt.masteryAnswer.
export const Repo = MasteryRepo.layer;
export const Services = MasteryService.layer;
export const Live = MasteryHandlers;
