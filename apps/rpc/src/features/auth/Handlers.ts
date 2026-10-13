import { AuthRpcs, AvatarRpcs } from "@examinus/contract";
import { Effect, Layer } from "effect";
import { AuthService } from "./Service.ts";
import { requirePermission } from "./Session.ts";

export const AuthHandlers = AuthRpcs.toLayer(
  Effect.gen(function* () {
    const auth = yield* AuthService;

    return AuthRpcs.of({
      "auth.config": () => auth.config,
      "auth.signInEmail": (input, { headers }) => auth.signInEmail(input, headers),
      "auth.register": (input, { headers }) => auth.register(input, headers),
      "auth.signInGoogle": (input, { headers }) => auth.signInGoogle(input, headers),
      "auth.signUpGoogle": (input, { headers }) => auth.signUpGoogle(input, headers),
      "auth.joinAsGuest": (input, { headers }) => auth.joinAsGuest(input, headers),
      "auth.session": (_, { headers }) => auth.session(headers),
      "auth.signOut": (_, { headers }) => auth.signOut(headers),
    });
  }),
);

export const AvatarHandlers = AvatarRpcs.toLayer(
  Effect.gen(function* () {
    const auth = yield* AuthService;

    return AvatarRpcs.of({
      "avatar.mine": Effect.fn("avatar.mine")(function* () {
        const user = yield* requirePermission({ avatar: ["update"] });
        return yield* auth.avatar(user.id);
      }),
      "avatar.save": Effect.fn("avatar.save")(function* ({ avatar }) {
        const user = yield* requirePermission({ avatar: ["update"] });
        yield* auth.saveAvatar(user.id, avatar);
      }),
    });
  }),
);

export const Handlers = Layer.mergeAll(AuthHandlers, AvatarHandlers);
