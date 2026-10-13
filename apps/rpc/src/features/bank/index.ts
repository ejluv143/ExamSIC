import { BankHandlers } from "./Handlers.ts";
import { BankRepo } from "./Repo.ts";
import { BankService } from "./Service.ts";

// The bank.* RPCs: the question bank, its tags and its shares between teachers.
export const Repo = BankRepo.layer;
export const Services = BankService.layer;
export const Live = BankHandlers;
