"use client";

import { useCallback, useEffect, useRef, useState, type ClipboardEventHandler, type DragEvent } from "react";
import clsx from "clsx";
import { Camera, ImageUp, Loader2, X } from "lucide-react";
import {
  maxPhotos,
  encodeDrawingAnswer,
  parseDrawingAnswer,
  type DrawingAnswer,
  type Stroke,
  type StudentBlankQuestion,
  type StudentDrawingQuestion,
  type StudentEssayQuestion,
  type StudentMatchingQuestion,
  type StudentMultipleChoiceQuestion,
} from "@examora/contract";
import { uploadImage, uploadPng } from "@/lib/upload-image";
import { AssetImage } from "./asset-image";
import { DrawingSurface, type SurfaceHandle } from "./drawing-canvas";
import { Markdown } from "./markdown";
import { MarkdownEditor } from "./markdown-editor";
import { Button, inputClass } from "./ui";

const letter = (i: number) => String.fromCharCode(65 + i);

// Markdown as plain text, for places that only take text (the options of a <select>).
export function plainText(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\$+/g, "")
    .replace(/[*_`~#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const selectClass = `${inputClass} appearance-auto`;

export function ChoiceAnswer({
  q,
  value,
  onChange,
  assetUrls,
}: {
  q: StudentMultipleChoiceQuestion;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  assetUrls: Record<string, string>;
}) {
  const picked = q.multipleCorrect ? (Array.isArray(value) ? value : []) : [typeof value === "string" ? value : ""];
  // Choices with pictures are cards in a grid; plain ones stay a list.
  const cards = q.choices.some((c) => c.imageId);
  return (
    <div>
      {q.multipleCorrect && <p className="mb-2 text-xs text-muted">Select all that apply.</p>}
      <div
        className={cards ? "grid grid-cols-1 gap-3 @md:grid-cols-2" : "space-y-2"}
        role={q.multipleCorrect ? "group" : "radiogroup"}
      >
        {q.choices.map((c, i) => {
          const checked = picked.includes(c.id);
          return (
            <label
              key={c.id}
              className={clsx(
                "flex cursor-pointer gap-3 rounded-lg border text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary",
                cards ? "flex-col p-3" : "items-center px-3 py-2.5",
                checked ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-muted",
              )}
            >
              {c.imageId && <AssetImage id={c.imageId} alt={c.alt ?? ""} assetUrls={assetUrls} className="max-h-48 w-full object-contain" />}
              <span className="flex min-w-0 items-center gap-3">
                <input
                  type={q.multipleCorrect ? "checkbox" : "radio"}
                  name={q.id}
                  checked={checked}
                  onChange={() =>
                    onChange(
                      q.multipleCorrect ? (checked ? picked.filter((x) => x !== c.id) : [...picked, c.id]) : c.id,
                    )
                  }
                  className="size-4 shrink-0 accent-primary"
                />
                <span className="font-medium text-muted">{letter(i)}.</span>
                <Markdown inline className="min-w-0" assetUrls={assetUrls}>
                  {c.text}
                </Markdown>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

const blankInput =
  "mx-1 w-36 max-w-full border-0 border-b-2 border-border bg-transparent px-1 py-0.5 text-center focus:border-primary focus:outline-none";

export function BlankAnswer({
  q,
  value,
  onChange,
  assetUrls,
}: {
  q: StudentBlankQuestion;
  value: string[] | string | undefined;
  onChange: (v: string[]) => void;
  assetUrls: Record<string, string>;
}) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const given = Array.from({ length: Math.max(1, q.blankCount) }, (_, i) => list[i] ?? "");
  const [selected, setSelected] = useState<number | null>(null);
  const setAt = (i: number, v: string) => onChange(given.map((x, j) => (j === i ? v : x)));

  if (q.mode === "identification")
    return (
      <div className="space-y-2">
        <Markdown assetUrls={assetUrls}>{q.prompt}</Markdown>
        <input
          value={given[0]}
          onChange={(e) => onChange([e.target.value])}
          placeholder="Your answer"
          aria-label="Your answer"
          className={inputClass}
        />
      </div>
    );

  const bank = q.clozeInput === "bank" && q.mode === "cloze";
  const counts = new Map<string, number>();
  for (const w of q.bank) counts.set(w, (counts.get(w) ?? 0) + 1);
  const used = (w: string) => given.filter((x) => x === w).length;

  function pick(word: string) {
    const target = selected !== null && !given[selected] ? selected : given.findIndex((x) => !x);
    if (target < 0) return;
    setAt(target, word);
    setSelected(null);
  }

  function renderBlank(i: number) {
    if (i >= given.length) return null;
    if (!bank && q.clozeInput === "dropdown")
      return (
        <select
          value={given[i]}
          onChange={(e) => setAt(i, e.target.value)}
          aria-label={`Blank ${i + 1}`}
          className="mx-1 max-w-full rounded-md border border-border bg-surface px-1.5 py-1 text-sm"
        >
          <option value="">Choose…</option>
          {(q.options[i] ?? []).map((o, k) => (
            <option key={k} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    if (bank)
      return (
        <button
          type="button"
          aria-label={given[i] ? `Blank ${i + 1}: ${given[i]}. Tap to return the word` : `Blank ${i + 1}, empty`}
          onClick={() => (given[i] ? setAt(i, "") : setSelected(selected === i ? null : i))}
          className={clsx(
            "mx-1 inline-block min-h-8 min-w-20 rounded-md border-b-2 px-2 py-0.5 align-baseline",
            given[i] ? "border-primary bg-primary-soft" : "border-border bg-surface-muted",
            selected === i && "outline-2 outline-primary",
          )}
        >
          {given[i] || "\u00a0"}
        </button>
      );
    return (
      <input
        value={given[i]}
        onChange={(e) => setAt(i, e.target.value)}
        aria-label={`Blank ${i + 1}`}
        className={blankInput}
      />
    );
  }

  return (
    <div className="space-y-3">
      <Markdown renderBlank={renderBlank} className="leading-10" assetUrls={assetUrls}>
        {q.prompt}
      </Markdown>
      {bank && (
        <div className="flex flex-wrap gap-2" aria-label="Word bank">
          {[...counts.keys()].map((w) => (
            <button
              key={w}
              type="button"
              disabled={used(w) >= (counts.get(w) ?? 0)}
              onClick={() => pick(w)}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-40"
            >
              {w}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MatchingAnswer({
  q,
  value,
  onChange,
  assetUrls,
}: {
  q: StudentMatchingQuestion;
  value: string[] | undefined;
  onChange: (v: string[]) => void;
  assetUrls: Record<string, string>;
}) {
  const given = q.left.map((_, i) => (Array.isArray(value) ? (value[i] ?? "") : ""));
  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {q.left.map((item, i) => (
          <li key={item.id} className="flex flex-col gap-1.5 @lg:flex-row @lg:items-center @lg:gap-3">
            <div className="flex min-w-0 flex-1 gap-2 text-sm">
              <span className="text-muted">{i + 1}.</span>
              <div className="min-w-0 space-y-1">
                <Markdown inline assetUrls={assetUrls}>
                  {item.text}
                </Markdown>
                {item.imageId && <AssetImage id={item.imageId} alt={item.alt ?? ""} assetUrls={assetUrls} className="max-h-32" />}
              </div>
            </div>
            <select
              value={given[i]}
              onChange={(e) => onChange(given.map((x, j) => (j === i ? e.target.value : x)))}
              aria-label={`Match for item ${i + 1}`}
              className={`${selectClass} @lg:max-w-64`}
            >
              <option value="">Choose…</option>
              {q.right.map((r, k) => (
                <option key={r.id} value={r.id}>
                  {letter(k)}. {plainText(r.text) || r.alt || "Picture"}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <ol className="space-y-1 rounded-lg bg-surface-muted p-3 text-sm" aria-label="Choices">
        {q.right.map((r, k) => (
          <li key={r.id} className="flex gap-2">
            <span className="font-medium text-muted">{letter(k)}.</span>
            <div className="min-w-0 space-y-1">
              <Markdown inline assetUrls={assetUrls}>
                {r.text}
              </Markdown>
              {r.imageId && <AssetImage id={r.imageId} alt={r.alt ?? ""} assetUrls={assetUrls} className="max-h-32" />}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// The essay is written in markdown. `onPaste` is passed to the text box so the exam can block pasting.
export function EssayAnswer({
  value,
  onChange,
  onPaste,
}: {
  q?: StudentEssayQuestion;
  value: string | undefined;
  onChange: (v: string) => void;
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>;
}) {
  return (
    <MarkdownEditor
      value={value ?? ""}
      onChange={onChange}
      label="Your answer"
      rows={8}
      placeholder="Write your answer…"
      onPaste={onPaste}
    />
  );
}

// What the exam calls before handing in (or moving on): makes sure the drawing's latest picture is uploaded (the
// answer is updated through `onChange`). Throws an Error with a message for the student when the upload fails.
export type DrawingFinalizer = () => Promise<void>;

// The picture of the canvas is sent this often while the student draws (only when the strokes changed).
const pictureEveryMs = 30_000;

const isImageDrag = (e: DragEvent<HTMLElement>) => Array.from(e.dataTransfer.types).includes("Files");

// A drawing question: a canvas to draw on and/or photos of work on paper. The answer is the strokes (so a reload
// restores the drawing and the teacher can replay it), the latest PNG of the canvas and up to three photos.
// Only drawing and uploads are inputs: pictures pasted from the clipboard are ignored.
export function DrawingInput({
  q,
  value,
  onChange,
  assetUrls,
  uploads,
  register,
}: {
  q: StudentDrawingQuestion;
  value: string | undefined;
  onChange: (v: string) => void;
  assetUrls: Record<string, string>;
  // false in a preview, where nothing is uploaded.
  uploads: boolean;
  register?: (questionId: string, finalize: DrawingFinalizer | null) => void;
}) {
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
