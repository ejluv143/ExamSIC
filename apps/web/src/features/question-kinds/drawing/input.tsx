"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Camera, ImageUp, Loader2, X } from "lucide-react";
import { maxPhotos, encodeDrawingAnswer, parseDrawingAnswer, type DrawingAnswer, type Stroke } from "@examinus/domain/drawing";
import { DrawingSurface, type SurfaceHandle } from "@/components/drawing-canvas";
import { Button } from "@/components/ui";
import { uploadImage, uploadPng } from "@/lib/upload-image";
import type { InputProps } from "../views/input";

// The picture of the canvas is sent this often while the student draws (only when the strokes changed).
const pictureEveryMs = 30_000;

const isImageDrag = (e: DragEvent<HTMLElement>) => Array.from(e.dataTransfer.types).includes("Files");

// A drawing question: a canvas to draw on and/or photos of work on paper. The answer is the strokes (so a reload
// restores the drawing and the teacher can replay it), the latest PNG of the canvas and up to three photos.
// Only drawing and uploads are inputs: pictures pasted from the clipboard are ignored.
export function Input({ q, value: stored, onChange, assetUrls, uploads, registerDrawing: register }: InputProps<"drawing">) {
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
  // `onChange` changes on every render of the exam; the timers and uploads below always use the newest.
  const emitRef = useRef(emit);
  useEffect(() => {
    emitRef.current = emit;
  });

  const surface = useRef<SurfaceHandle>(null);
  // The strokes the last uploaded picture shows (null: none yet).
  const pictured = useRef<readonly Stroke[] | null>(initial.assetId ? initial.strokes : null);
  const syncing = useRef<Promise<void> | null>(null);
  const [picture, setPicture] = useState<{ state: "idle" | "uploading" | "error"; message?: string }>({ state: "idle" });

  function setStrokes(strokes: Stroke[]) {
    const cur = latest.current;
    // An emptied canvas has no picture any more.
    emit({ ...cur, strokes, assetId: strokes.length === 0 ? null : cur.assetId });
    if (strokes.length === 0) pictured.current = null;
  }

  const sendPicture = useCallback(async () => {
    while (syncing.current) await syncing.current.catch(() => {});
    const strokes = latest.current.strokes;
    if (!uploads || strokes.length === 0 || strokes === pictured.current || !surface.current) return;
    const job = (async () => {
      setPicture({ state: "uploading" });
      try {
        const blob = await surface.current!.exportPng();
        const sent = await uploadPng(blob, q.canvasWidth, q.canvasHeight, "answer");
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
  }, [uploads, q.canvasWidth, q.canvasHeight]);

  useEffect(() => {
    if (!register) return;
    register(q.id, sendPicture);
    return () => register(q.id, null);
  }, [register, sendPicture, q.id]);

  useEffect(() => {
    if (!uploads) return;
    const timer = setInterval(() => void sendPicture().catch(() => {}), pictureEveryMs);
    return () => clearInterval(timer);
  }, [uploads, sendPicture]);

  // Photos: each is resized and stripped of its metadata, uploaded, then added to the answer.
  const [uploading, setUploading] = useState(0);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Local previews of photos just taken, until their signed URLs arrive.
  const [previews, setPreviews] = useState<Record<string, string>>({});
  useEffect(() => {
    const urls = Object.values(previews);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [previews]);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  async function addPhotos(files: File[]) {
    setPhotoError(null);
    for (const file of files) {
      if (latest.current.photos.length >= maxPhotos) {
        setPhotoError(`You can add up to ${maxPhotos} photos.`);
        break;
      }
      setUploading((n) => n + 1);
      try {
        const sent = await uploadImage(file, "answer");
        const cur = latest.current;
        if (cur.photos.length >= maxPhotos) throw new Error(`You can add up to ${maxPhotos} photos.`);
        setPreviews((p) => ({ ...p, [sent.assetId]: URL.createObjectURL(file) }));
        emitRef.current({ ...cur, photos: [...cur.photos, sent.assetId] });
      } catch (e) {
        setPhotoError(e instanceof Error ? e.message : "The photo couldn't be uploaded.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  const removePhoto = (id: string) => emit({ ...latest.current, photos: latest.current.photos.filter((p) => p !== id) });
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    void addPhotos(Array.from(e.target.files ?? []));
    // So the same file can be chosen again.
    e.target.value = "";
  };

  const background =
    q.backgroundImageId && assetUrls[q.backgroundImageId]
      ? { url: assetUrls[q.backgroundImageId], alt: q.backgroundAlt ?? "" }
      : undefined;
  const full = answer.photos.length + uploading >= maxPhotos;

  return (
    <div
      className="space-y-4"
      // Pictures from the clipboard aren't an answer. Text pasted into a label is the exam's paste setting.
      onPaste={(e) => {
        if (Array.from(e.clipboardData.items).some((i) => i.kind === "file")) e.preventDefault();
      }}
      // A dropped file must not open in the tab and end the exam; photos can be dropped unless camera-only.
      onDragOver={(e) => isImageDrag(e) && e.preventDefault()}
      onDrop={(e) => {
        if (!isImageDrag(e)) return;
        e.preventDefault();
        if (q.allowUpload && !q.cameraOnly && uploads) void addPhotos(Array.from(e.dataTransfer.files));
      }}
    >
      {q.allowDraw && (
        <div className="space-y-2">
          <DrawingSurface
            ref={surface}
            width={q.canvasWidth}
            height={q.canvasHeight}
            strokes={answer.strokes}
            onStrokes={setStrokes}
            background={background}
            label={q.backgroundAlt ? `Drawing board over: ${q.backgroundAlt}` : "Drawing board"}
          />
          {picture.state === "uploading" && (
            <p role="status" className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Uploading your drawing…
            </p>
          )}
          {picture.state === "error" && (
            <p role="alert" className="flex flex-wrap items-center gap-2 rounded-lg bg-danger-soft p-2 text-xs text-danger">
              Your drawing couldn&apos;t be uploaded: {picture.message}
              <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void sendPicture().catch(() => {})}>
                Try again
              </Button>
            </p>
          )}
        </div>
      )}

      {q.allowUpload && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Photos <span className="font-normal text-muted">({answer.photos.length} of {maxPhotos})</span>
          </p>
          {!uploads ? (
            <p className="text-xs text-muted">Students can take or upload up to {maxPhotos} photos here.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={full} onClick={() => camera.current?.click()}>
                <Camera className="size-4" aria-hidden /> Take a photo
              </Button>
              {!q.cameraOnly && (
                <Button variant="secondary" disabled={full} onClick={() => gallery.current?.click()}>
                  <ImageUp className="size-4" aria-hidden /> Upload a photo
                </Button>
              )}
              <input
                ref={camera}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                aria-label="Take a photo"
                onChange={pick}
              />
              {!q.cameraOnly && (
                <input ref={gallery} type="file" accept="image/*" multiple hidden aria-label="Upload a photo" onChange={pick} />
              )}
            </div>
          )}
          {q.cameraOnly && uploads && <p className="text-xs text-muted">Photos must be taken with your camera.</p>}
          {photoError && (
            <p role="alert" className="text-xs text-danger">
              {photoError}
            </p>
          )}
          {(answer.photos.length > 0 || uploading > 0) && (
            <ul className="flex flex-wrap gap-2">
              {answer.photos.map((id, i) => {
                const url = previews[id] ?? assetUrls[id];
                return (
                  <li key={id} className="relative size-24 overflow-hidden rounded-lg border border-border bg-surface-muted">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={`Your photo ${i + 1}`} className="size-full object-cover" />
                    ) : (
                      <span className="grid size-full place-items-center text-xs text-muted">Photo {i + 1}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(id)}
                      aria-label={`Remove photo ${i + 1}`}
                      className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </li>
                );
              })}
              {Array.from({ length: uploading }, (_, i) => (
                <li
                  key={`uploading-${i}`}
                  className="grid size-24 place-items-center rounded-lg border border-dashed border-border text-xs text-muted"
                >
                  <Loader2 className="size-4 animate-spin" aria-label="Uploading photo" />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
