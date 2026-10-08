// Form validation with Effect Schema: the decoded value, or the first issue's message for the form.
import { Result, Schema, SchemaIssue } from "effect";

const format = SchemaIssue.makeFormatterStandardSchemaV1();

export function parseForm<S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  input: unknown,
): Result.Result<S["Type"], string> {
  return Result.mapError(
    Schema.decodeUnknownResult(schema)(input),
    (error) => format(error.issue).issues[0]?.message ?? "Check the form and try again.",
  );
}

// Same address check as the sign-in and account forms have always used.
export const emailPattern = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
