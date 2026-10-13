import { Layer } from "effect";
import { LiveAuthMiddlewareLive, LiveHandlers, LiveTicketHandlers } from "./Handlers.ts";
import { LiveRepo } from "./Repo.ts";
import { LiveHub } from "./Service.ts";

// Tickets, the live streams and the middleware that checks tickets; `LiveHub` is used by most features.
export const Repo = LiveRepo.layer;
export const Services = LiveHub.layer;
export const Live = Layer.mergeAll(LiveTicketHandlers, LiveHandlers, LiveAuthMiddlewareLive);
