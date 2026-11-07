// Which assets the Repo reaches, against a real Postgres: those of the organization a person works in, and for someone
// without an organization (a guest) those of any.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { assets } from "../../database/schemas/index.ts";
import { testPostgres } from "../../testing/postgres.ts";
import { assetRow } from "../../testing/rows.ts";
import { seedOrganizations, seedUsers } from "../../testing/seed.ts";
import { AssetRepo } from "./Repo.ts";

const pg = await testPostgres();
const { db } = pg;
afterAll(() => pg.close());

const repoLayer = AssetRepo.layer.pipe(Layer.provide(pg.layer));
const run = <A>(use: (repo: AssetRepo["Service"]) => Effect.Effect<A>) =>
  Effect.runPromise(AssetRepo.use(use).pipe(Effect.provide(repoLayer)));

const asset = (id: string, organizationId: string | null, over: Parameters<typeof assetRow>[0] = {}) =>
  assetRow({ id: `asset-${id}`, s3Key: `k-${id}`, ownerId: "teacher-1", organizationId, ...over });

beforeEach(async () => {
  await pg.reset();
  await seedOrganizations(db, "org-1", "org-2");
  await seedUsers(db, "teacher-1", "teacher-2");
  await db.insert(assets).values([
    asset("a1", "org-1"),
    asset("a2", "org-2"),
    asset("a3", null),
    asset("pending", "org-1", { status: "pending" }),
  ]);
});

describe("AssetRepo.ready", () => {
  const ids = ["asset-a1", "asset-a2", "asset-a3", "asset-pending"];
  const readyIn = async (organizationId: string | null) =>
    (await run((repo) => repo.ready(ids, organizationId))).map((a) => a.id).sort();

  test("an organization reaches its own ready images and nobody else's", async () => {
    expect(await readyIn("org-1")).toEqual(["asset-a1"]);
    expect(await readyIn("org-2")).toEqual(["asset-a2"]);
  });

  test("without an organization (a guest) the ready images of any are reached", async () => {
    expect(await readyIn(null)).toEqual(["asset-a1", "asset-a2", "asset-a3"]);
  });
});

describe("AssetRepo.findOwned", () => {
  const found = async (id: string, owner: { id: string; organizationId: string | null }) =>
    (await run((repo) => repo.findOwned(id, owner)))?.id ?? null;

  test("an upload is found by its owner in the organization it was made in", async () => {
    expect(await found("asset-a1", { id: "teacher-1", organizationId: "org-1" })).toBe("asset-a1");
  });

  test("not by its owner working in another organization, nor by someone else", async () => {
    expect(await found("asset-a1", { id: "teacher-1", organizationId: "org-2" })).toBeNull();
    expect(await found("asset-a1", { id: "teacher-2", organizationId: "org-1" })).toBeNull();
  });

  test("an owner without an organization finds their uploads wherever they were made", async () => {
    expect(await found("asset-a2", { id: "teacher-1", organizationId: null })).toBe("asset-a2");
    expect(await found("asset-a3", { id: "teacher-1", organizationId: null })).toBe("asset-a3");
  });
});
