import { AdminHandlers } from "./Handlers.ts";
import { AdminRepo } from "./Repo.ts";
import { AdminService } from "./Service.ts";

// Account administration (see main.ts for how Repo, Services and Live fit together).
export const Repo = AdminRepo.layer;
export const Services = AdminService.layer;
export const Live = AdminHandlers;
