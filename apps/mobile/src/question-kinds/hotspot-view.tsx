// A picture with hotspot regions and/or a student's markers on it (the web's `hotspot-view.tsx`). Coordinates are
// 0..1 across the picture; the frame measures the picture and hands the children its size in pixels.
import type { HotspotRegion } from "@examinus/domain/kinds/hotspot";
import { inRegion, type Marker } from "@examinus/domain/placement";
import { useEffect, useState, type ReactNode } from "react";
import { Image, Text, View } from "react-native";
import { GestureDetector, type GestureType, type LegacyComposedGesture } from "react-native-gesture-handler";
import Svg, { Ellipse, Rect } from "react-native-svg";
import { AssetImage } from "@/markdown/markdown";
import { useColors } from "@/ui/theme";

export const markerSize = 28;

export type Box = { w: number; h: number };

// The picture, as wide as the space it's in; `children` draw over it. With `gesture`, touches on it are handled
// (the gesture is made for the picture's size).
export function HotspotFrame({
  url,
  alt,
  gesture,
  children,
}: {
  url: string;
  alt: string;
  gesture?: (box: Box) => GestureType | LegacyComposedGesture;
  children: (box: Box) => ReactNode;
}) {
  const [shape, setShape] = useState<{ url: string; ratio: number } | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    let live = true;
    Image.getSize(
      url,
      (w, h) => live && h > 0 && setShape({ url, ratio: w / h }),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [url]);
  const ratio = shape?.url === url ? shape.ratio : 4 / 3;
  const box = { w: width, h: width / ratio };
  const body = (
    <View style={{ width: "100%", height: box.h }} className="overflow-hidden rounded-md bg-surface-muted">
      <Image source={{ uri: url }} accessibilityLabel={alt} resizeMode="stretch" style={{ width: "100%", height: "100%" }} />
      {width > 0 && children(box)}
    </View>
  );
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && gesture ? <GestureDetector gesture={gesture(box)}>{body}</GestureDetector> : body}
      {width === 0 && <View style={{ height: 1 }} />}
    </View>
  );
}

// A numbered marker centred on its point.
export function MarkerDot({ marker, n, box, tone }: { marker: Marker; n: number; box: Box; tone: string }) {
  return (
    <View
      pointerEvents="none"
      className="absolute items-center justify-center rounded-full border-2 border-white"
      style={{ left: marker.x * box.w - markerSize / 2, top: marker.y * box.h - markerSize / 2, width: markerSize, height: markerSize, backgroundColor: tone }}
    >
      <Text className="text-xs font-bold text-white">{n}</Text>
    </View>
  );
}

// The outlines of hotspot regions with their names at the top-left corner.
export function Regions({ regions, box, tone }: { regions: readonly HotspotRegion[]; box: Box; tone: string }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: box.w, height: box.h }}>
      <Svg width={box.w} height={box.h}>
        {regions.map((r) =>
          r.shape === "rect" ? (
            <Rect key={r.id} x={r.x * box.w} y={r.y * box.h} width={r.w * box.w} height={r.h * box.h} fill={tone} fillOpacity={0.18} stroke={tone} strokeWidth={2} />
          ) : (
            <Ellipse
              key={r.id}
              cx={(r.x + r.w / 2) * box.w}
              cy={(r.y + r.h / 2) * box.h}
              rx={(r.w / 2) * box.w}
              ry={(r.h / 2) * box.h}
              fill={tone}
              fillOpacity={0.18}
              stroke={tone}
              strokeWidth={2}
            />
          ),
        )}
      </Svg>
      {regions
        .filter((r) => r.label?.trim())
        .map((r) => (
          <Text
            key={r.id}
            numberOfLines={1}
            className="absolute rounded-br bg-surface/90 px-1 text-[10px] font-medium text-foreground"
            style={{ left: r.x * box.w, top: r.y * box.h, maxWidth: box.w * 0.4 }}
          >
            {r.label}
          </Text>
        ))}
    </View>
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
}: {
  imageId: string;
  alt: string;
  assetUrls: Readonly<Record<string, string>>;
  markers?: readonly Marker[];
  regions?: readonly HotspotRegion[];
  tolerance?: number;
}) {
  const colors = useColors();
  const url = assetUrls[imageId];
  if (!url) return <AssetImage id={imageId} alt={alt} assetUrls={assetUrls} />;
  return (
    <HotspotFrame url={url} alt={alt}>
      {(box) => (
        <>
          {regions && <Regions regions={regions} box={box} tone={colors.success} />}
          {markers.map((m, i) => (
            <MarkerDot
              key={i}
              marker={m}
              n={i + 1}
              box={box}
              tone={regions ? (regions.some((r) => inRegion(r, m, tolerance)) ? colors.success : colors.danger) : colors.primary}
            />
          ))}
        </>
      )}
    </HotspotFrame>
  );
}
