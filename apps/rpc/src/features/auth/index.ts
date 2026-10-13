import { Layer } from "effect";
import { BetterAuth } from "./BetterAuth.ts";
import { Handlers } from "./Handlers.ts";
import { AuthRepo } from "./Repo.ts";
import { AuthService } from "./Service.ts";
import { AuthMiddlewareLive } from "./Session.ts";

// Sign-in, sessions, guests and avatars, plus the auth middleware every other RPC group uses. `BetterAuth` is also
// used by admin and classes (Google Classroom tokens).
export const Repo = AuthRepo.layer;
export const Services = AuthService.layer.pipe(Layer.provideMerge(BetterAuth.layer));
export const Live = Layer.mergeAll(Handlers, AuthMiddlewareLive);
