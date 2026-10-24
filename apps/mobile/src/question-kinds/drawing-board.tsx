// A drawing board in canvas units (the web's `DrawingSurface`): strokes drawn with a finger, pen or mouse on an SVG,
// over an optional picture. Without `onStrokes` it only shows the strokes (and the `overlay`, the teacher's marks).
import { maxStrokePoints, maxStrokes, type Stroke, type StrokeTool } from "@examinus/domain/drawing";
import { useCallback, useId, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Defs, G, Image as SvgImage, Mask, Path, Rect, Text as SvgText } from "react-native-svg";
import { base64ToBytes } from "@/lib/upload";
import { containRect, penColors, strokeSteps, strokesMarkup, textPx, thicknesses, type Step } from "@/lib/drawing-render";

export type BoardHandle = {
  // The drawing (with its background picture, when it can be read) as the bytes of a PNG the size of the canvas.
  exportPng: () => Promise<Uint8Array>;
};

const tools: { tool: StrokeTool; label: string }[] = [
  { tool: "pen", label: "Pen" },
  { tool: "highlighter", label: "Highlighter" },
  { tool: "text", label: "Text" },
  { tool: "eraser", label: "Eraser" },
];

// The shapes of the steps, each step's erasers masking everything before it.
function renderSteps(steps: readonly Step[], prefix: string, width: number, height: number): ReactNode {
  let body: ReactNode[] = [];
  const masks: ReactNode[] = [];
  steps.forEach((step, i) => {
    body = [
      ...body,
      ...step.shapes.map((s, j) =>
        s.kind === "path" ? (
          <Path key={`${i}-${j}`} d={s.d} fill={s.color} fillOpacity={s.opacity} />
        ) : (
          <SvgText key={`${i}-${j}`} x={s.x} y={s.y} fontSize={s.size} fill={s.color}>
            {s.text}
          </SvgText>
        ),
      ),
    ];
    if (step.erasers.length === 0) return;
    const id = `${prefix}m${i}`;
    masks.push(
      <Mask key={id} id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} fill="white" />
        {step.erasers.map((d, j) => (
          <Path key={j} d={d} fill="black" />
        ))}
      </Mask>,
    );
    body = [
      <G key={`g${i}`} mask={`url(#${id})`}>
        {body}
      </G>,
    ];
  });
  return (
    <>
      <Defs>{masks}</Defs>
      {body}
    </>
  );
}

function loadImage(src: string, anonymous: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    if (anonymous) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The picture couldn't be read."));
    img.src = src;
  });
}

// Expo web: the SVG is painted onto a canvas (a background from another origin without CORS would taint it; the
// strokes alone are then sent, so the teacher still gets the drawing).
async function exportWeb(strokes: readonly Stroke[], width: number, height: number, background: string | undefined): Promise<Uint8Array> {
  const markup = URL.createObjectURL(new Blob([strokesMarkup(strokes, width, height)], { type: "image/svg+xml" }));
  try {
    const layer = await loadImage(markup, false);
    const draw = async (withBackground: boolean) => {
      const out = document.createElement("canvas");
      out.width = width;
      out.height = height;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("This browser can't save the drawing.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      if (withBackground && background) {
        const img = await loadImage(background, true);
        const r = containRect(img.naturalWidth, img.naturalHeight, width, height);
        ctx.drawImage(img, r.x, r.y, r.w, r.h);
      }
      ctx.drawImage(layer, 0, 0, width, height);
      return new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
    };
    const blob = await draw(true).catch(() => draw(false));
    if (!blob) throw new Error("This browser can't save the drawing.");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(markup);
  }
}

export function DrawingBoard({
  width,
  height,
  strokes,
  onStrokes,
  background,
  overlay,
  label,
  ref,
}: {
  width: number;
  height: number;
  strokes: readonly Stroke[];
  onStrokes?: (next: Stroke[]) => void;
  // The picture under the strokes (a signed URL).
  background?: string;
  // Read-only strokes over everything (the teacher's marks).
  overlay?: readonly Stroke[];
  label: string;
  ref?: Ref<BoardHandle>;
}) {
  const prefix = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [tool, setTool] = useState<StrokeTool>("pen");
  const [color, setColor] = useState<string>(penColors[0]);
  const [size, setSize] = useState<number>(thicknesses[1].size);
  const [redo, setRedo] = useState<Stroke[]>([]);
  const [live, setLive] = useState<Stroke | null>(null);
  const [textAt, setTextAt] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState("");
  // The label being typed, so the blur that follows Enter doesn't place it twice.
  const textRef = useRef<{ x: number; y: number } | null>(null);
  const liveRef = useRef<Stroke | null>(null);
  // Clock zero for the strokes' timing: the drawing's first stroke (kept going after a reload).
  const origin = useRef<number | null>(null);
  const svg = useRef<Svg>(null);
  const readOnly = !onStrokes;
  const scale = layoutWidth / width;

  // The API keeps at most this many strokes and points; stop before it would drop the end of the drawing.
  const full = useMemo(
    () => strokes.length >= maxStrokes || strokes.reduce((n, s) => n + s.points.length, 0) >= maxStrokePoints - 5000,
    [strokes],
  );
  const steps = useMemo(() => strokeSteps(strokes), [strokes]);
  const overlaySteps = useMemo(() => strokeSteps(overlay ?? []), [overlay]);
  const liveSteps = useMemo(() => (live && live.tool !== "eraser" ? strokeSteps([live]) : []), [live]);
  const liveEraser = useMemo(() => (live?.tool === "eraser" ? strokeSteps([live]) : []), [live]);

  useImperativeHandle(ref, () => ({
    exportPng: async () => {
      if (Platform.OS === "web") return exportWeb(strokes, width, height, background);
      const node = svg.current;
      if (!node) throw new Error("The drawing isn't ready yet.");
      const base64 = await new Promise<string>((resolve) => node.toDataURL(resolve, { width, height }));
      return base64ToBytes(base64);
    },
  }));

  const now = useCallback(() => {
    if (origin.current === null) {
      const last = strokes.at(-1);
      origin.current = Date.now() - (last ? last.at + last.ms : 0);
    }
    return Date.now() - origin.current;
  }, [strokes]);

  const commit = useCallback(
    (stroke: Stroke) => {
      if (!onStrokes) return;
      setRedo([]);
      onStrokes([...strokes, stroke]);
    },
    [onStrokes, strokes],
  );

  const point = useCallback(
    (x: number, y: number): [number, number, number] => [Math.round((x / scale) * 10) / 10, Math.round((y / scale) * 10) / 10, 0.5],
    [scale],
  );

  // The callbacks below run on touch events, never while rendering; the compiler rule can't tell.
  /* eslint-disable react-hooks/refs */
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .maxPointers(1)
        .onBegin((e) => {
          if (full || scale <= 0) return;
          const next: Stroke = { tool, color, size, points: [point(e.x, e.y)], at: now(), ms: 0 };
          liveRef.current = next;
          setLive(next);
        })
        .onUpdate((e) => {
          const stroke = liveRef.current;
          if (!stroke) return;
          const p = point(e.x, e.y);
          const last = stroke.points[stroke.points.length - 1]!;
          // Skip points that barely moved, so a stroke stays small.
          if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.5) return;
          const next = { ...stroke, points: [...stroke.points, p] };
          liveRef.current = next;
          setLive(next);
        })
        .onFinalize(() => {
          const stroke = liveRef.current;
          liveRef.current = null;
          setLive(null);
          if (stroke) commit({ ...stroke, ms: Math.max(0, now() - stroke.at) });
        }),
    [tool, color, size, full, scale, point, now, commit],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .maxDistance(10)
        .onEnd((e, success) => {
          if (!success || full || scale <= 0) return;
          const at = { x: e.x / scale, y: e.y / scale };
          textRef.current = at;
          setDraft("");
          setTextAt(at);
        }),
    [full, scale],
  );
  /* eslint-enable react-hooks/refs */

  const placeText = () => {
    const at = textRef.current;
    textRef.current = null;
    setTextAt(null);
    const text = draft.trim();
    if (!at || !text) return;
    commit({ tool: "text", color, size, points: [[at.x, at.y, 0.5]], text, at: now(), ms: 0 });
  };

  const undo = () => {
    const last = strokes.at(-1);
    if (!last || !onStrokes) return;
    setRedo((r) => [...r, last]);
    onStrokes(strokes.slice(0, -1));
  };
  const redoStroke = () => {
    const next = redo.at(-1);
    if (!next || !onStrokes) return;
    setRedo((r) => r.slice(0, -1));
    onStrokes([...strokes, next]);
  };
  const clear = () => {
    if (!onStrokes || strokes.length === 0) return;
    // Latest first, so redo brings them back in their original order.
    setRedo((r) => [...r, ...strokes.slice().reverse()]);
    onStrokes([]);
  };

  const chip = (active: boolean) => `rounded-md border px-2.5 py-1.5 ${active ? "border-primary bg-primary-soft" : "border-transparent bg-surface"}`;
  const action = "rounded-md bg-surface px-2.5 py-1.5 active:opacity-70";
  const height2 = layoutWidth * (height / width);

  return (
    <View className="gap-2">
      {!readOnly && (
        <View className="gap-2 rounded-lg border border-border bg-surface-muted p-2">
          <View className="flex-row flex-wrap gap-1" accessibilityLabel="Tool">
            {tools.map((t) => (
              <Pressable key={t.tool} accessibilityRole="button" accessibilityState={{ selected: tool === t.tool }} onPress={() => setTool(t.tool)} className={chip(tool === t.tool)}>
                <Text className={`text-sm ${tool === t.tool ? "font-medium text-primary" : "text-foreground"}`}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-row flex-wrap items-center gap-3">
            {tool !== "eraser" && (
              <View className="flex-row items-center gap-2" accessibilityLabel="Colour">
                {penColors.map((c) => (
                  <Pressable
                    key={c}
                    accessibilityRole="button"
                    accessibilityLabel={`Colour ${c}`}
                    accessibilityState={{ selected: color === c }}
                    onPress={() => setColor(c)}
                    hitSlop={4}
                    style={{ backgroundColor: c }}
                    className={`size-7 rounded-full border-2 ${color === c ? "border-primary" : "border-surface"}`}
                  />
                ))}
              </View>
            )}
            <View className="flex-row gap-1" accessibilityLabel="Thickness">
              {thicknesses.map((t) => (
                <Pressable
                  key={t.size}
                  accessibilityRole="button"
                  accessibilityLabel={t.label}
                  accessibilityState={{ selected: size === t.size }}
                  onPress={() => setSize(t.size)}
                  className={`size-9 items-center justify-center ${chip(size === t.size)} px-0 py-0`}
                >
                  <View className="rounded-full bg-foreground" style={{ width: t.size + 3, height: t.size + 3 }} />
                </Pressable>
              ))}
            </View>
          </View>
          <View className="flex-row flex-wrap gap-1">
            <Pressable accessibilityRole="button" onPress={undo} disabled={strokes.length === 0} className={`${action} ${strokes.length === 0 ? "opacity-40" : ""}`}>
              <Text className="text-sm text-foreground">Undo</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={redoStroke} disabled={redo.length === 0} className={`${action} ${redo.length === 0 ? "opacity-40" : ""}`}>
              <Text className="text-sm text-foreground">Redo</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={clear} disabled={strokes.length === 0} className={`${action} ${strokes.length === 0 ? "opacity-40" : ""}`}>
              <Text className="text-sm text-danger">Clear</Text>
            </Pressable>
          </View>
        </View>
      )}
      <View
        accessibilityLabel={label}
        onLayout={(e) => setLayoutWidth(e.nativeEvent.layout.width)}
        className="w-full overflow-hidden rounded-lg border border-border bg-white"
        style={{ maxWidth: readOnly ? undefined : width }}
      >
        {layoutWidth > 0 && (
          <GestureDetector gesture={readOnly ? Gesture.Manual() : tool === "text" ? tap : pan}>
            <View style={{ width: layoutWidth, height: height2 }}>
              <Svg ref={svg} width={layoutWidth} height={height2} viewBox={`0 0 ${width} ${height}`}>
                <Rect x={0} y={0} width={width} height={height} fill="#ffffff" />
                {background && (
                  <SvgImage x={0} y={0} width={width} height={height} href={{ uri: background }} preserveAspectRatio="xMidYMid meet" />
                )}
                {renderSteps(steps, `${prefix}s`, width, height)}
                {renderSteps(overlaySteps, `${prefix}o`, width, height)}
                {renderSteps(liveSteps, `${prefix}l`, width, height)}
                {liveEraser.flatMap((s) => s.erasers).map((d, i) => (
                  <Path key={i} d={d} fill="#9ca3af" fillOpacity={0.5} />
                ))}
              </Svg>
              {textAt && (
                <TextInput
                  autoFocus
                  maxLength={200}
                  accessibilityLabel="Text label"
                  value={draft}
                  onChangeText={setDraft}
                  onBlur={placeText}
                  onSubmitEditing={placeText}
                  style={{ position: "absolute", left: textAt.x * scale, top: textAt.y * scale, minWidth: 80, fontSize: textPx(size) * scale, color, padding: 0, backgroundColor: "rgba(255,255,255,0.8)" }}
                />
              )}
            </View>
          </GestureDetector>
        )}
      </View>
      {!readOnly && full && <Text className="text-xs text-danger">That is as much as one drawing can hold. Undo a stroke to add more.</Text>}
    </View>
  );
}
