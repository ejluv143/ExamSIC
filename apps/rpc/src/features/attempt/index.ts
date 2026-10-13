import { Layer } from "effect";
import { Coach } from "./Coach.ts";
import { AttemptHandlers } from "./Handlers.ts";
import { AttemptRepo } from "./Repo.ts";
import { Results } from "./Results.ts";
import { Saving } from "./Saving.ts";
import { AttemptService } from "./Service.ts";
import { Taking } from "./Taking.ts";

// Taking, saving, results and coach; `AttemptService` (submit, ownership checks) is also used by session, game
// and mastery.
export const Repo = AttemptRepo.layer;
export const Services = Layer.mergeAll(Taking.layer, Saving.layer, Coach.layer).pipe(
  Layer.provideMerge(Results.layer),
  Layer.provideMerge(AttemptService.layer),
);
export const Live = AttemptHandlers;
