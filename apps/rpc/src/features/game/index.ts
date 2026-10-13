import { Layer } from "effect";
import { GameHandlers } from "./Handlers.ts";
import { GameTicker } from "./Jobs.ts";
import { GameRepo } from "./Repo.ts";
import { RoomStore } from "./RoomStore.ts";
import { Game } from "./Service.ts";
import { GameViews } from "./Views.ts";

// The rooms in memory, what each screen sees, and the game flow on top. One `Game` for the whole API, so auth,
// session and live see the same rooms.
export const Repo = GameRepo.layer;
export const Services = Game.layer.pipe(Layer.provideMerge(GameViews.layer), Layer.provideMerge(RoomStore.layer));
export const Live = Layer.mergeAll(GameHandlers, GameTicker);
