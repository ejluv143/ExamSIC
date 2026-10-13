// A new primary key such as "quiz-0199…": the prefix says what kind of row it is. UUID v7: time-ordered, so new
// rows land at the end of the index and sort by creation.
export const newId = (prefix: string) => `${prefix}-${Bun.randomUUIDv7()}`;
