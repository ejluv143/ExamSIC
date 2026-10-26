import { encodeHotspotAnswer, hotspotResults, parseHotspotAnswer, type Marker } from "@examinus/domain/placement";
import { useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { AssetImage } from "@/markdown/markdown";
import { Button } from "@/ui/components";
import { useColors } from "@/ui/theme";
import { HotspotFrame, HotspotView, MarkerDot, markerSize, type Box } from "./hotspot-view";
import { NoAnswer, PlainPrompt, ResultFrame } from "./review-parts";
import type { KindInputProps, KindReviewProps } from "./types";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// "Tap the right spot" answer: tap the picture to drop numbered markers (up to `maxClicks`). Tap a marker, or use its
// Remove button, to take it off; drag a marker to move it.
export function Input({ question: q, value: answer, onChange, assetUrls, disabled }: KindInputProps<"hotspot">) {
  const colors = useColors();
  const value = typeof answer === "string" ? answer : undefined;
  const stored = useMemo(() => parseHotspotAnswer(value).slice(0, q.maxClicks), [value, q.maxClicks]);
  // The marker being dragged and where it is now; the answer changes when it is dropped.
  const [drag, setDrag] = useState<{ index: number; at: Marker } | null>(null);
  const dragging = useRef<number | null>(null);
  const [full, setFull] = useState(false);
  const markers = drag ? stored.map((m, i) => (i === drag.index ? drag.at : m)) : stored;
  const atLimit = stored.length >= q.maxClicks;

  const commit = (next: Marker[]) => {
    onChange(encodeHotspotAnswer(next));
    setFull(false);
  };
  const remove = (index: number) => commit(stored.filter((_, i) => i !== index));
  const place = (at: Marker) => {
    if (atLimit) {
      setFull(true);
      return;
    }
    commit([...stored, at]);
  };

  // The marker under a touch (the last one drawn wins), or -1.
  const markerAt = (box: Box, x: number, y: number) => {
    for (let i = stored.length - 1; i >= 0; i--) {
      const m = stored[i]!;
      if (Math.hypot(m.x * box.w - x, m.y * box.h - y) <= markerSize / 2 + 6) return i;
    }
    return -1;
  };
  const pointAt = (box: Box, x: number, y: number): Marker => ({ x: clamp01(x / box.w), y: clamp01(y / box.h) });

  const gesture = (box: Box) => {
    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDistance(10)
      .onEnd((e, success) => {
        if (!success) return;
        const hit = markerAt(box, e.x, e.y);
        if (hit >= 0) remove(hit);
        else place(pointAt(box, e.x, e.y));
      });
    // Only a touch that starts on a marker drags; anywhere else the page scrolls.
    const pan = Gesture.Pan()
      .runOnJS(true)
      .manualActivation(true)
      .onTouchesDown((e) => {
        const t = e.changedTouches[0];
        dragging.current = t ? markerAt(box, t.x, t.y) : -1;
      })
      .onTouchesMove((_, manager) => (dragging.current !== null && dragging.current >= 0 ? manager.activate() : manager.fail()))
      .onUpdate((e) => {
        if (dragging.current !== null && dragging.current >= 0) setDrag({ index: dragging.current, at: pointAt(box, e.x, e.y) });
      })
      .onFinalize((e, success) => {
        const index = dragging.current;
        dragging.current = null;
        setDrag(null);
        if (success && index !== null && index >= 0) commit(stored.map((m, i) => (i === index ? pointAt(box, e.x, e.y) : m)));
      });
    return Gesture.Race(pan, tap);
  };

  const url = assetUrls[q.imageId];
  if (!url) return <AssetImage id={q.imageId} alt={q.alt} assetUrls={assetUrls} />;
  return (
    <View className="gap-2">
      <Text className="text-sm text-muted">
        {q.maxClicks === 1 ? "Tap the picture to mark the spot." : `Tap the picture to place up to ${q.maxClicks} markers.`} Tap a marker to remove it, or drag
        it to move it.
      </Text>
      <HotspotFrame url={url} alt={q.alt} gesture={disabled ? undefined : gesture}>
        {(box) => markers.map((m, i) => <MarkerDot key={i} marker={m} n={i + 1} box={box} tone={colors.primary} />)}
      </HotspotFrame>
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-sm font-medium text-foreground">
          Markers: {stored.length} of {q.maxClicks}
        </Text>
        {!disabled &&
          stored.map((_, i) => (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`Remove marker ${i + 1}`}
              onPress={() => remove(i)}
              className="rounded-md border border-border bg-surface px-2.5 py-1.5 active:opacity-70"
            >
              <Text className="text-xs text-foreground">Remove {i + 1}</Text>
            </Pressable>
          ))}
      </View>
      {!disabled && stored.length > 0 && (
        <View className="self-start">
          <Button variant="secondary" onPress={() => commit([])}>
            Clear
          </Button>
        </View>
      )}
      {full && <Text className="text-xs text-warning">Remove a marker to place another.</Text>}
    </View>
  );
}

// The student's taps on the picture with the correct areas outlined, and how many areas they found.
export function Review({ question: q, answer, feedback, assetUrls: urls }: KindReviewProps<"hotspot">) {
  const markers = parseHotspotAnswer(answer);
  const { hit, outside } = hotspotResults(q, markers);
  return (
    <View className="gap-2">
      <PlainPrompt q={q} urls={urls} />
      <ResultFrame q={q} urls={urls} feedback={feedback}>
        {markers.length === 0 ? (
          <NoAnswer />
        ) : (
          <View className="gap-1">
            <HotspotView imageId={q.imageId} alt={q.alt} assetUrls={urls} markers={markers} regions={q.regions} tolerance={q.tolerance} />
            <Text className="text-xs text-muted">
              {hit.filter(Boolean).length} of {q.regions.length} areas found
              {outside > 0 && `; ${outside} ${outside === 1 ? "click" : "clicks"} outside every area`}
            </Text>
          </View>
        )}
      </ResultFrame>
    </View>
  );
}
