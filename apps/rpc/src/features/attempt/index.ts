import { Layer } from "effect";
import { Checking } from "./Checking.ts";
import { Coach } from "./Coach.ts";
import { AttemptHandlers } from "./Handlers.ts";
import { CheckSweep } from "./Jobs.ts";
import { AttemptRepo } from "./Repo.ts";
import { Results } from "./Results.ts";
import { Saving } from "./Saving.ts";
import { AttemptService } from "./Service.ts";
import { Taking } from "./Taking.ts";

// Taking, saving, results and coach; `AttemptService` (submit, ownership checks) is also used by session, game
// and mastery. `Checking` runs submitted code answers on the runner after the submit, and the sweep retries them.
export const Repo = AttemptRepo.layer;
export const Services = Layer.mergeAll(Taking.layer, Saving.layer, Coach.layer).pipe(
  Layer.provideMerge(Results.layer),
  Layer.provideMerge(AttemptService.layer),
  Layer.provideMerge(Checking.layer),
);
export const Live = Layer.mergeAll(AttemptHandlers, CheckSweep);
