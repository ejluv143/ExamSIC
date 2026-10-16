// Uploaded images. The files live in S3; this table says who uploaded each one and whether the upload was
// confirmed. Questions, choices and drawing answers refer to an asset by its id (never by foreign key: the
// reference is inside markdown or jsonb, and the daily cleanup deletes the assets nothing refers to).
import { AssetPurpose } from "@examinus/domain/asset";
import { index, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./auth.ts";
import { organizations } from "./organizations.ts";
import { newId } from "../../platform/ids.ts";
import { timestamps } from "./_helpers.ts";

export const assetPurpose = pgEnum("asset_purpose", AssetPurpose.literals);
export const assetStatus = pgEnum("asset_status", ["pending", "ready"]);

export const assets = pgTable(
  "assets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("asset")),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: assetPurpose("purpose").notNull(),
    s3Key: text("s3_key").notNull().unique(),
    mime: text("mime").notNull(),
    // Known once the upload is confirmed.
    sizeBytes: integer("size_bytes"),
    width: integer("width"),
    height: integer("height"),
    sha256: text("sha256"),
    status: assetStatus("status").notNull().default("pending"),
    ...timestamps,
  },
  (t) => [
    index("assets_owner_id_idx").on(t.ownerId),
    index("assets_organization_id_idx").on(t.organizationId),
    index("assets_status_created_at_idx").on(t.status, t.createdAt),
  ],
);

export type AssetItem = typeof assets.$inferSelect;
