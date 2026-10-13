"use server";

import type { AssetMime, AssetPurpose } from "@examinus/domain/asset";
import * as assets from "@/features/assets/data";

// What the browser needs to upload an image to S3 and use it: a presigned POST, a check afterwards, and the
// signed URLs to show images. Teachers upload "question" images and students "answer" images.

export async function requestImageUpload(purpose: AssetPurpose, mime: AssetMime, size: number) {
  return assets.requestUpload(purpose, mime, size);
}

export async function confirmImageUpload(assetId: string) {
  return assets.confirmUpload(assetId);
}

// Fresh signed URLs for these assets (they last ten minutes).
export async function fetchAssetUrls(assetIds: string[]) {
  return assets.assetUrls(assetIds);
}
