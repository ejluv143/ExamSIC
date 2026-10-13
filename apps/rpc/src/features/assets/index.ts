import { Layer } from "effect";
import { AssetHandlers } from "./Handlers.ts";
import { AssetCleanup } from "./Jobs.ts";
import { AssetRepo } from "./Repo.ts";
import { Assets } from "./Service.ts";

// The asset.* RPCs and the daily cleanup; `Assets` is also used by attempt, game and mastery.
export const Repo = AssetRepo.layer;
export const Services = Assets.layer;
export const Live = Layer.mergeAll(AssetHandlers, AssetCleanup);
