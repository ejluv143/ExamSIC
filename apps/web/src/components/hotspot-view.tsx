import clsx from "clsx";
import { inRegion, type HotspotRegion, type Marker } from "@examora/contract";
import { AssetImage } from "./asset-image";

// The outlines of hotspot regions, drawn in an SVG whose box is the image (viewBox 0..1, stretched to fit). The
// strokes don't scale, so they stay thin whatever the image size. `dashed` draws just a dashed outline.
export function RegionShapes({
  regions,
  selectedId,
  tint = "text-primary",
  dashed = false,
}: {
  regions: readonly HotspotRegion[];
  selectedId?: string | null;
  tint?: string;
  dashed?: boolean;
}) {
  return (
    <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden className={clsx("pointer-events-none absolute inset-0 size-full", tint)}>
      {regions.map((r) => {
        const selected = r.id === selectedId;
        const common = {
          fill: dashed ? "none" : "currentColor",
          fillOpacity: selected ? 0.3 : 0.18,
          stroke: "currentColor",
          strokeWidth: selected ? 3 : 2,
          strokeDasharray: dashed ? "4 4" : undefined,
          vectorEffect: "non-scaling-stroke" as const,
        };
        return r.shape === "rect" ? (
          <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} {...common} />
        ) : (
          <ellipse key={r.id} cx={r.x + r.w / 2} cy={r.y + r.h / 2} rx={r.w / 2} ry={r.h / 2} {...common} />
        );
      })}
    </svg>
  );
}

// Region names, pinned to the top-left corner of each region.
export function RegionLabels({ regions }: { regions: readonly HotspotRegion[] }) {
  return (
    <>
      {regions
        .filter((r) => r.label?.trim())
        .map((r) => (
          <span
            key={r.id}
            aria-hidden
            className="pointer-events-none absolute max-w-[40%] truncate rounded-br bg-surface/90 px-1 text-[10px] font-medium leading-4 text-foreground"
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%` }}
          >
            {r.label}
          </span>
        ))}
    </>
  );
}

// A numbered marker centred on its point. It keeps its size at any image size.
export function MarkerDot({ marker, n, className }: { marker: Marker; n: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "pointer-events-none absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-xs font-bold text-white shadow",
        className ?? "bg-primary",
      )}
      style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
    >
      {n}
    </span>
  );
}

// A picture with hotspot regions and/or a student's markers on it, read-only. With regions, markers inside one
// (widened by the tolerance) are green and the others red.
export function HotspotView({
  imageId,
  alt,
  assetUrls,
  markers = [],
  regions,
  tolerance = 0,
  className,
}: {
  imageId: string;
  alt: string;
  assetUrls: Record<string, string>;
  markers?: readonly Marker[];
  regions?: readonly HotspotRegion[];
  tolerance?: number;
  className?: string;
}) {
  const url = assetUrls[imageId];
  const inside = markers.map((m) => (regions ? regions.some((r) => inRegion(r, m, tolerance)) : true));
  const hits = inside.filter(Boolean).length;
  const summary = [
    `${markers.length} ${markers.length === 1 ? "marker" : "markers"}`,
    regions && markers.length > 0 ? `${hits} inside a correct area` : null,
    regions ? `${regions.length} correct ${regions.length === 1 ? "area" : "areas"} shown` : null,
  ]
    .filter(Boolean)
    .join(", ");
  if (!url) return <AssetImage id={imageId} alt={alt} assetUrls={assetUrls} />;
  return (
    <figure className={clsx("m-0", className)}>
      <div className="relative inline-block max-w-full align-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} className="block h-auto max-w-full rounded-md" />
        {regions && <RegionShapes regions={regions} tint="text-success" />}
        {regions && <RegionLabels regions={regions} />}
        {markers.map((m, i) => (
          <MarkerDot key={i} marker={m} n={i + 1} className={regions ? (inside[i] ? "bg-success" : "bg-danger") : undefined} />
        ))}
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}
