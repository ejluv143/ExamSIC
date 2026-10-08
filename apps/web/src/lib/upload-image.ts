// Browser side of image uploads: shrinks the picture, drops what the file carries besides its pixels (EXIF, with
// the location), then sends it straight to S3 with the presigned POST the API issued and confirms it.
import { assetMimes, maxAssetBytes, type AssetMime, type AssetPurpose } from "@examora/contract";
import { confirmImageUpload, requestImageUpload } from "@/app/assets/actions";

// The longest side of an uploaded image, in pixels.
export const maxImageSide = 2000;

export type UploadedImage = { assetId: string; width: number; height: number; mime: AssetMime };

const isAssetMime = (type: string): type is AssetMime => (assetMimes as readonly string[]).includes(type);

// Redraws the image on a canvas at most `maxImageSide` on its longest side. Drawing and re-encoding keeps only the
// pixels, so EXIF data (camera, location) is gone; the camera's rotation is applied first. GIFs become PNGs.
async function shrink(file: Blob): Promise<{ blob: Blob; mime: AssetMime; width: number; height: number }> {
  if (!isAssetMime(file.type)) throw new Error("Use a PNG, JPEG, WebP or GIF image.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => {
    throw new Error("That image couldn't be read.");
  });
  const scale = Math.min(1, maxImageSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't resize images.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const mime: AssetMime = file.type === "image/gif" ? "image/png" : file.type;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.9));
  if (!blob || blob.type !== mime) throw new Error("This browser can't save that kind of image.");
  return { blob, mime, width, height };
}

// Sends a blob to S3 and has the API check it. Throws an Error whose message is for people.
async function send(blob: Blob, mime: AssetMime, purpose: AssetPurpose, width: number, height: number): Promise<UploadedImage> {
  if (blob.size > maxAssetBytes) throw new Error("Images can be up to 5 MB.");
  const target = await requestImageUpload(purpose, mime, blob.size);
  if ("error" in target) throw new Error(target.error);
  const form = new FormData();
  for (const [name, value] of Object.entries(target.ok.fields)) form.append(name, value);
  // S3 wants the file as the last field.
  form.append("file", blob);
  const response = await fetch(target.ok.url, { method: "POST", body: form });
  if (!response.ok) throw new Error(response.status === 400 ? "That file is too big." : "The image couldn't be uploaded.");
  const confirmed = await confirmImageUpload(target.ok.assetId);
  if ("error" in confirmed) throw new Error(confirmed.error);
  return { assetId: target.ok.assetId, width, height, mime };
}

// A picked, dropped, pasted or photographed image file.
export async function uploadImage(file: Blob, purpose: AssetPurpose): Promise<UploadedImage> {
  const small = await shrink(file);
  return send(small.blob, small.mime, purpose, small.width, small.height);
}

// A PNG made by the app itself (the drawing canvas), which is already the size the teacher chose.
export function uploadPng(blob: Blob, width: number, height: number, purpose: AssetPurpose): Promise<UploadedImage> {
  return send(blob, "image/png", purpose, width, height);
}
