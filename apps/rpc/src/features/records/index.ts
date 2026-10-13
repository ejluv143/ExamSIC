import { ClassRecordHandlers } from "./Handlers.ts";
import { RecordsRepo } from "./Repo.ts";
import { RecordsService } from "./Service.ts";

// Class records.
export const Repo = RecordsRepo.layer;
export const Services = RecordsService.layer;
export const Live = ClassRecordHandlers;
