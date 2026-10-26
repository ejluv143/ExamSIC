import { assetMimes, type AssetMime } from "@examinus/domain/asset";
import {
  encodeDrawingAnswer,
  maxPhotos,
  parseDrawingAnswer,
  parseDrawingFeedback,
  type DrawingAnswer,
  type Stroke,
} from "@examinus/domain/drawing";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { uploadImageBytes, base64ToBytes } from "@/lib/upload";
import { Button } from "@/ui/components";
import { DrawingBoard, type BoardHandle } from "./drawing-board";
import { NoAnswer, PlainPrompt, ResultFrame } from "./review-parts";
import type { KindInputProps, KindReviewProps } from "./types";

// The picture of the canvas is sent this often while the student draws (only when the strokes changed).
const pictureEveryMs = 30_000;

const isAssetMime = (type: string | undefined): type is AssetMime => (assetMimes as readonly string[]).includes(type ?? "");

// A drawing question: a canvas to draw on and/or photos of work on paper. The answer is the strokes (so a reload
// restores the drawing and the teacher can replay it), the latest PNG of the canvas and up to three photos.
export function Input({ question: q, value: stored, onChange, assetUrls, disabled, registerDrawing: register }: KindInputProps<"drawing">) {
  const value = typeof stored === "string" ? stored : undefined;
  const [initial] = useState(() => parseDrawingAnswer(value));
  // The answer as last emitted: uploads finish later, and must add to the current answer, not the one they began with.
  const latest = useRef(initial);
  const [answer, setAnswer] = useState(initial);
  const emit = useCallback(
    (next: DrawingAnswer) => {
      latest.current = next;
      setAnswer(next);
      onChange(encodeDrawingAnswer(next));
    },
    [onChange],
  );
  // `onChange` changes on every render of the paper; the uploads below always use the newest.
  const emitRef = useRef(emit);
  useEffect(() => {
    emitRef.current = emit;
  });

  // A preview (no `registerDrawing`) uploads nothing.
  const uploads = register !== undefined;
  const board = useRef<BoardHandle>(null);
  // The strokes the last uploaded picture shows (null: none yet).
  const pictured = useRef<readonly Stroke[] | null>(initial.assetId ? initial.strokes : null);
  const syncing = useRef<Promise<void> | null>(null);
  const [picture, setPicture] = useState<{ state: "idle" | "uploading" | "error"; message?: string }>({ state: "idle" });

  const setStrokes = (strokes: Stroke[]) => {
    const cur = latest.current;
    // An emptied canvas has no picture any more.
    emit({ ...cur, strokes, assetId: strokes.length === 0 ? null : cur.assetId });
    if (strokes.length === 0) pictured.current = null;
  };

  const sendPicture = useCallback(async () => {
    while (syncing.current) await syncing.current.catch(() => undefined);
    const strokes = latest.current.strokes;
    if (!uploads || strokes.length === 0 || strokes === pictured.current || !board.current) return;
    const job = (async () => {
      setPicture({ state: "uploading" });
      try {
        const bytes = await board.current!.exportPng();
        const sent = await uploadImageBytes(bytes, "image/png", "answer");
        pictured.current = strokes;
        const cur = latest.current;
        // Cleared while the picture was on its way: it shows nothing now.
        if (cur.strokes.length > 0) emitRef.current({ ...cur, assetId: sent.assetId });
        setPicture({ state: "idle" });
      } catch (e) {
        const message = e instanceof Error ? e.message : "The picture couldn't be sent.";
        setPicture({ state: "error", message });
        throw new Error(message);
      }
    })();
    syncing.current = job;
    try {
      await job;
    } finally {
      syncing.current = null;
    }
  }, [uploads]);

  useEffect(() => {
    if (!register) return;
    register(q.id, sendPicture);
    return () => register(q.id, null);
  }, [register, sendPicture, q.id]);

  useEffect(() => {
    if (!uploads) return;
    const timer = setInterval(() => void sendPicture().catch(() => undefined), pictureEveryMs);
    return () => clearInterval(timer);
  }, [uploads, sendPicture]);

  // Photos: each is uploaded, then added to the answer.
  const [uploading, setUploading] = useState(0);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Local previews of photos just taken, until their signed URLs arrive.
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const addPhotos = async (assets: ImagePicker.ImagePickerAsset[]) => {
    setPhotoError(null);
    for (const asset of assets) {
      if (latest.current.photos.length >= maxPhotos) {
        setPhotoError(`You can add up to ${maxPhotos} photos.`);
        break;
      }
      setUploading((n) => n + 1);
      try {
        if (!asset.base64) throw new Error("That image couldn't be read.");
        const mime: AssetMime = isAssetMime(asset.mimeType) ? asset.mimeType : "image/jpeg";
        const sent = await uploadImageBytes(base64ToBytes(asset.base64), mime, "answer");
        const cur = latest.current;
        if (cur.photos.length >= maxPhotos) throw new Error(`You can add up to ${maxPhotos} photos.`);
        setPreviews((p) => ({ ...p, [sent.assetId]: asset.uri }));
        emitRef.current({ ...cur, photos: [...cur.photos, sent.assetId] });
      } catch (e) {
        setPhotoError(e instanceof Error ? e.message : "The photo couldn't be uploaded.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const takePhoto = async () => {
    setPhotoError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPhotoError("Allow the camera in your settings to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true });
    if (!result.canceled) await addPhotos(result.assets);
  };

  const choosePhotos = async () => {
    setPhotoError(null);
    const left = Math.max(1, maxPhotos - latest.current.photos.length);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: left,
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled) await addPhotos(result.assets);
  };

  const removePhoto = (id: string) => emit({ ...latest.current, photos: latest.current.photos.filter((p) => p !== id) });

  const background = q.backgroundImageId ? assetUrls[q.backgroundImageId] : undefined;
  const full = answer.photos.length + uploading >= maxPhotos;

  return (
    <View className="gap-4">
      {q.allowDraw && (
        <View className="gap-2">
          <DrawingBoard
            ref={board}
            width={q.canvasWidth}
            height={q.canvasHeight}
            strokes={answer.strokes}
            onStrokes={disabled ? undefined : setStrokes}
            background={background}
            label={q.backgroundAlt ? `Drawing board over: ${q.backgroundAlt}` : "Drawing board"}
          />
          {picture.state === "uploading" && (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" />
              <Text className="text-xs text-muted">Uploading your drawing…</Text>
            </View>
          )}
          {picture.state === "error" && (
            <View className="gap-2 rounded-lg bg-danger-soft p-2">
              <Text className="text-xs text-danger">Your drawing couldn&apos;t be uploaded: {picture.message}</Text>
              <Button variant="secondary" onPress={() => void sendPicture().catch(() => undefined)}>
                Try again
              </Button>
            </View>
          )}
        </View>
      )}

      {q.allowUpload && (
        <View className="gap-2">
          <Text className="text-sm font-medium text-foreground">
            Photos{" "}
            <Text className="font-normal text-muted">
              ({answer.photos.length} of {maxPhotos})
            </Text>
          </Text>
          {!uploads ? (
            <Text className="text-xs text-muted">Students can take or upload up to {maxPhotos} photos here.</Text>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              <Button variant="secondary" disabled={full || disabled} onPress={() => void takePhoto()}>
                Take a photo
              </Button>
              {!q.cameraOnly && (
                <Button variant="secondary" disabled={full || disabled} onPress={() => void choosePhotos()}>
                  Upload a photo
                </Button>
              )}
            </View>
          )}
          {q.cameraOnly && uploads && <Text className="text-xs text-muted">Photos must be taken with your camera.</Text>}
          {photoError && <Text className="text-xs text-danger">{photoError}</Text>}
          {(answer.photos.length > 0 || uploading > 0) && (
            <View className="flex-row flex-wrap gap-2">
              {answer.photos.map((id, i) => {
                const url = previews[id] ?? assetUrls[id];
                return (
                  <View key={id} className="size-24 overflow-hidden rounded-lg border border-border bg-surface-muted">
                    {url ? (
                      <Image source={{ uri: url }} accessibilityLabel={`Your photo ${i + 1}`} resizeMode="cover" style={{ width: "100%", height: "100%" }} />
                    ) : (
                      <View className="flex-1 items-center justify-center">
                        <Text className="text-xs text-muted">Photo {i + 1}</Text>
                      </View>
                    )}
                    {!disabled && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove photo ${i + 1}`}
                        onPress={() => removePhoto(id)}
                        className="absolute right-1 top-1 size-7 items-center justify-center rounded-full bg-black/60"
                      >
                        <Text className="text-xs font-bold text-white">✕</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
              {Array.from({ length: uploading }, (_, i) => (
                <View key={`uploading-${i}`} className="size-24 items-center justify-center rounded-lg border border-dashed border-border">
                  <ActivityIndicator size="small" />
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// The student's drawing with the teacher's marks over it, and their photos.
export function Review({ question: q, answer, feedback, assetUrls: urls }: KindReviewProps<"drawing">) {
  const drawing = parseDrawingAnswer(answer);
  const { marks, text } = parseDrawingFeedback(feedback);
  const empty = drawing.strokes.length === 0 && !drawing.assetId && drawing.photos.length === 0;
  const pictureUrl = drawing.assetId ? urls[drawing.assetId] : undefined;
  const backgroundUrl = q.backgroundImageId ? urls[q.backgroundImageId] : undefined;
  return (
    <View className="gap-2">
      <PlainPrompt q={q} urls={urls} />
      {/* A drawing's feedback is the teacher's comment plus marks (shown on the picture), never raw JSON. */}
      <ResultFrame q={q} urls={urls} feedback={text}>
        {empty ? (
          <NoAnswer />
        ) : (
          <View className="gap-2">
            {(drawing.assetId || drawing.strokes.length > 0) && (
              <DrawingBoard
                width={q.canvasWidth}
                height={q.canvasHeight}
                strokes={pictureUrl ? [] : drawing.strokes}
                background={pictureUrl ?? backgroundUrl}
                overlay={marks}
                label={marks.length > 0 ? "Your drawing, with your teacher's marks" : "Your drawing"}
              />
            )}
            {drawing.photos.map((id, i) =>
              urls[id] ? (
                <Image key={id} source={{ uri: urls[id] }} accessibilityLabel={`Your photo ${i + 1}`} resizeMode="contain" style={{ width: "100%", height: 240 }} />
              ) : (
                <Text key={id} className="text-xs text-muted">
                  Photo {i + 1}
                </Text>
              ),
            )}
          </View>
        )}
      </ResultFrame>
    </View>
  );
}
