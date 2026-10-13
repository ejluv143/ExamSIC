import { Layer } from "effect";
import { SessionHandlers } from "./Handlers.ts";
import { QuizSweep } from "./Jobs.ts";
import { SessionLifecycle } from "./Lifecycle.ts";
import { SessionLiveActions } from "./LiveActions.ts";
import { SessionReports } from "./Reports.ts";
import { SessionRepo } from "./Repo.ts";
import { SessionService } from "./Service.ts";

// Session lifecycle, live actions and reports, and the sweep that opens, ends and submits on schedule.
export const Repo = SessionRepo.layer;
export const Services = Layer.mergeAll(SessionLifecycle.layer, SessionLiveActions.layer, SessionReports.layer).pipe(
  Layer.provideMerge(SessionService.layer),
);
export const Live = Layer.mergeAll(SessionHandlers, QuizSweep);
