import { timestamp } from "drizzle-orm/pg-core";

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

// A new primary key such as "quiz-3f2a…": the prefix says what kind of row it is.
export const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
