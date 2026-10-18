"use client";

import { useSyncExternalStore } from "react";
import QRCode from "qrcode";
import { formatJoinKey } from "@examinus/domain/join-key";

const noSubscribe = () => () => {};

// A QR code for `text` as inline SVG: modules use currentColor, the background stays transparent.
export function QrCode({ text, size, className, label }: { text: string; size: number; className?: string; label?: string }) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const quiet = 2;
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
  }
  return (
    <svg
      role="img"
      aria-label={label ?? `QR code for ${text}`}
      viewBox={`0 0 ${n + quiet * 2} ${n + quiet * 2}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
    >
      <path d={d} fill="currentColor" />
    </svg>
  );
}

// The QR for the invite link (/join?id=KEY), the same URL the invite link text shows. The origin is only known in the browser.
export function JoinQr({ code, size, className }: { code: string; size: number; className?: string }) {
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  if (!origin) return null;
  const url = `${origin}/join?id=${formatJoinKey(code)}`;
  return <QrCode text={url} size={size} className={className} label={`QR code to join: ${url}`} />;
}
