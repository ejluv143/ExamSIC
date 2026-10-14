import { describe, expect, test } from "bun:test";
import { assetIdOfRef, assetIdsIn, assetRef } from "./asset.ts";

const id = "asset-0b6f3c1e-2d4a-4f8b-9c7d-1e2f3a4b5c6d";

describe("asset references", () => {
  test("a logo field round-trips its asset id", () => {
    expect(assetIdOfRef(assetRef(id))).toBe(id);
  });

  test("URLs and older data: URLs aren't asset references", () => {
    expect(assetIdOfRef("/logos/school-of-it.png")).toBeNull();
    expect(assetIdOfRef("data:image/png;base64,iVBORw0KGgo=")).toBeNull();
  });

  test("a header with an uploaded logo is found by assetIdsIn, like images in text", () => {
    const header = { schoolLogoUrl: assetRef(id), departmentLogoUrl: "/logos/school-of-it.png" };
    expect(assetIdsIn(JSON.stringify(header))).toEqual([id]);
  });
});
