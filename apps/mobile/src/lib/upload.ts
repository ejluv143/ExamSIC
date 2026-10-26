// Image uploads of the paper (the web's `features/assets/upload-image.ts`): asks the API for a presigned POST, sends
// the bytes straight to S3 and has the API confirm them. The body is built by hand as `multipart/form-data` bytes,
// because React Native can't make a `Blob` from bytes, and the same bytes then work on the phone and in a browser.
import { maxAssetBytes, type AssetMime, type AssetPurpose } from "@examinus/domain/asset";
import { callApi } from "./api";

export type UploadedImage = { assetId: string; mime: AssetMime };

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// The bytes of a base64 text (a `data:` URL's prefix is dropped).
export function base64ToBytes(text: string): Uint8Array {
  const base64 = text.slice(text.indexOf(",") + 1).replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((base64.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < base64.length; i += 4) {
    const a = alphabet.indexOf(base64[i]!);
    const b = alphabet.indexOf(base64[i + 1]!);
    const c = i + 2 < base64.length ? alphabet.indexOf(base64[i + 2]!) : -1;
    const d = i + 3 < base64.length ? alphabet.indexOf(base64[i + 3]!) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c !== -1) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d !== -1) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

function multipart(fields: Readonly<Record<string, string>>, file: Uint8Array, mime: string): { body: Uint8Array; boundary: string } {
  const boundary = `----examinus${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const text = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(text.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  // S3 wants the file as the last field.
  parts.push(text.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="upload"\r\nContent-Type: ${mime}\r\n\r\n`));
  parts.push(file);
  parts.push(text.encode(`\r\n--${boundary}--\r\n`));
  const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    body.set(p, at);
    at += p.length;
  }
  return { body, boundary };
}

// Sends the image bytes to S3 and has the API check them. Throws an Error whose message is for people.
export async function uploadImageBytes(bytes: Uint8Array, mime: AssetMime, purpose: AssetPurpose): Promise<UploadedImage> {
  if (bytes.length > maxAssetBytes) throw new Error("Images can be up to 5 MB.");
  const target = await callApi((api) => api["asset.createUpload"]({ purpose, mime, size: bytes.length }));
  const { body, boundary } = multipart(target.fields, bytes, mime);
  const response = await fetch(target.url, {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: body as unknown as BodyInit,
  }).catch(() => {
    throw new Error("Can't reach Examinus. Check your connection and try again.");
  });
  if (!response.ok) throw new Error(response.status === 400 ? "That file is too big." : "The image couldn't be uploaded.");
  await callApi((api) => api["asset.confirm"]({ assetId: target.assetId }));
  return { assetId: target.assetId, mime };
}
