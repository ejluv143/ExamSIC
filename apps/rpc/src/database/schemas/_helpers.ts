import { customType, timestamp } from "drizzle-orm/pg-core";

// A jsonb column for values that may be plain strings. Drizzle's own `jsonb` runs JSON.parse on every string it
// reads, so a text answer like "42" or a drawing's JSON came back as a number or an object; node-postgres has
// already parsed the jsonb by then, so this one hands the value over as it is.
export const jsonValue = <T>(name: string) =>
  customType<{ data: T; driverData: unknown }>({
    dataType: () => "jsonb",
    toDriver: (value) => JSON.stringify(value),
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

// A new primary key such as "quiz-0199…": the prefix says what kind of row it is. UUID v7: time-ordered, so new
// rows land at the end of the index and sort by creation.
export const newId = (prefix: string) => `${prefix}-${Bun.randomUUIDv7()}`;
