import { sql } from "drizzle-orm";
import { customType, timestamp } from "drizzle-orm/pg-core";

// A jsonb column for values that may be plain strings. Drizzle's own `jsonb` runs JSON.parse on every string it
// reads, so a text answer like "42" or a drawing's JSON came back as a number or an object. Bun.sql decodes a jsonb
// result itself, so reading hands the value over as it is. Writing sends the JSON as text and casts it: given a
// plain JS value, Bun.sql JSON-encodes strings a second time (a JSON string of the JSON) and refuses booleans.
export const jsonValue = <T>(name: string) =>
  customType<{ data: T; driverData: unknown }>({
    dataType: () => "jsonb",
    toDriver: (value) => (value === null ? null : sql`(${JSON.stringify(value)})::text::jsonb`),
    fromDriver: (value) => value as T,
  })(name);

export const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const createdAt = () => timestamptz("created_at").notNull().defaultNow();
export const updatedAt = () =>
  timestamptz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const timestamps = {
  createdAt: createdAt(),
  updatedAt: updatedAt(),
};
