// Reads the type and size of PNG, JPEG, WebP and GIF files from their headers, so an upload is checked against what
// the file really is rather than what the browser said.
import type { AssetMime } from "@examora/contract";

export type ImageInfo = { mime: AssetMime; width: number; height: number };

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;

function png(b: Uint8Array): ImageInfo | null {
  if (b.length < 24 || ascii(b, 12, 16) !== "IHDR") return null;
  return { mime: "image/png", width: u32be(b, 16), height: u32be(b, 20) };
}

function gif(b: Uint8Array): ImageInfo | null {
  return b.length < 10 ? null : { mime: "image/gif", width: u16le(b, 6), height: u16le(b, 8) };
}

function webp(b: Uint8Array): ImageInfo | null {
  if (b.length < 30) return null;
  const chunk = ascii(b, 12, 16);
  if (chunk === "VP8X") return { mime: "image/webp", width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  if (chunk === "VP8 ") return { mime: "image/webp", width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return { mime: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

function jpeg(b: Uint8Array): ImageInfo | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    // Start of frame (not the table markers that sit in the same range).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { mime: "image/jpeg", height: u16be(b, i + 5), width: u16be(b, i + 7) };
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

// null when the bytes aren't one of the allowed images.
export function imageInfo(b: Uint8Array): ImageInfo | null {
  const info =
    b[0] === 0x89 && ascii(b, 1, 4) === "PNG"
      ? png(b)
      : ascii(b, 0, 3) === "GIF"
        ? gif(b)
        : ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP"
          ? webp(b)
          : b[0] === 0xff && b[1] === 0xd8
            ? jpeg(b)
            : null;
  return info && info.width > 0 && info.height > 0 ? info : null;
}
