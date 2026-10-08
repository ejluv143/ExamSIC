// Images through the API: signed-in teachers upload question images and students their answers straight to S3
// (the API only issues the presigned POST and checks the file afterwards); URLs to view them are short-lived.
import "server-only";
import type { AssetMime, AssetPurpose } from "@examora/contract";
import { Result } from "effect";
import { headers } from "next/headers";
import { callApi, forwardedHeaders } from "../api/client";
import { requirePermission } from "../auth/dal";
import { write } from "./api";

export async function requestUpload(purpose: AssetPurpose, mime: AssetMime, size: number) {
  await requirePermission({ asset: ["create"] });
  return write((api) => api["asset.createUpload"]({ purpose, mime, size }));
}

export async function confirmUpload(assetId: string) {
  await requirePermission({ asset: ["create"] });
  return write((api) => api["asset.confirm"]({ assetId }));
}

// Signed URLs by asset id for the images the signed-in user may see. Without S3 (or on any refusal) it is
// empty: pages then show the images' alt text instead of failing.
export async function assetUrls(ids: readonly string[]): Promise<Record<string, string>> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return {};
  await requirePermission({ asset: ["read"] });
  const result = await callApi((api) => api["asset.urls"]({ assetIds: wanted }), forwardedHeaders(await headers()));
  return Result.isSuccess(result) ? result.success : {};
}
