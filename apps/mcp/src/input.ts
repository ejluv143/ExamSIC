// Tool inputs are Effect Schemas. The MCP SDK takes any Standard Schema that can also describe itself as JSON
// Schema; Effect provides both halves, so no second validation library is needed.
import { Schema } from "effect";

// A struct of plain fields decodes with no services; the cast says so for a generic `F`, which TypeScript can't
// work out on its own. The callback then receives the struct's `Type`.
export const input = <F extends Schema.Struct.Fields>(fields: F) =>
  Schema.toStandardJSONSchemaV1(
    Schema.toStandardSchemaV1(Schema.Struct(fields) as unknown as Schema.ConstraintCodec<Schema.Struct<F>["Type"], Schema.Struct<F>["Encoded"]>),
  );

export const optional = <S extends Schema.Top>(schema: S, description?: string) =>
  Schema.optionalKey(description === undefined ? schema : schema.annotate({ description }));

// A raw draft object in one of the shapes from question_shapes, 1 to 50 per call.
export const Drafts = Schema.Array(Schema.Record(Schema.String, Schema.Unknown)).check(Schema.isMinLength(1), Schema.isMaxLength(50)).annotate({
  description: "Raw draft objects in the shapes from question_shapes.",
});
