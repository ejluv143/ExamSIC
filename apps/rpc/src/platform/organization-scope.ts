import { type Column, eq, isNull, type SQL, sql } from "drizzle-orm";

// Rows in the organization a request works in: that organization's, or, in the personal space (null), those with
// none. `eq` alone would match nothing for null.
export const organizationIs = (column: Column, organizationId: string | null): SQL =>
  organizationId === null ? isNull(column) : eq(column, organizationId);

// Two rows in the same organization, both possibly in none (`=` treats NULLs as different).
export const sameOrganization = (a: Column, b: Column): SQL => sql`${a} is not distinct from ${b}`;
