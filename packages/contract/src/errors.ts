import { Schema } from "effect";

// No valid session.
export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}) {}

// The signed-in user's role doesn't grant the operation, or the operation isn't allowed on that target.
export class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", { message: Schema.String }) {}

export class InvalidCredentials extends Schema.TaggedError<InvalidCredentials>()("InvalidCredentials", {}) {}

export class AccountSuspended extends Schema.TaggedError<AccountSuspended>()("AccountSuspended", {}) {}

// Over a rate limit; `message` is written for people and says how long to wait.
export class TooManyRequests extends Schema.TaggedError<TooManyRequests>()("TooManyRequests", {
  message: Schema.String,
}) {}

// Better Auth refused the request; `message` is written for people (e.g. "User already exists").
export class AuthRejected extends Schema.TaggedError<AuthRejected>()("AuthRejected", { message: Schema.String }) {}

// No such record, or not one the signed-in user may see; `message` is written for people.
export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", { message: Schema.String }) {}

// The request conflicts with existing data (e.g. a roster entry that already has an account).
export class Conflict extends Schema.TaggedError<Conflict>()("Conflict", { message: Schema.String }) {}
