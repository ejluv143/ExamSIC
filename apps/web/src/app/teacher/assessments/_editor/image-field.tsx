"use client";

import clsx from "clsx";
import { ImagePlus, Trash2 } from "lucide-react";
import { createContext, useContext, useRef, useState } from "react";
import { assetMimes } from "@examora/contract";
import { Button, inputClass } from "@/components/ui";
import { uploadImage } from "@/lib/upload-image";
import { useAssetUrls } from "@/lib/use-asset-urls";

// The signed image URLs the server rendered the editor page with; the fields below ask for the rest themselves.
export const EditorAssetUrls = createContext<Record<string, string>>({});

export type PickedImage = { imageId?: string; alt?: string };

// `item` with its picture replaced: the old imageId and alt are dropped, the new ones (if any) added.
export function withImage<T extends PickedImage>(item: T, picked: PickedImage): T {
  const rest: Record<string, unknown> = { ...item };
  delete rest.imageId;
  delete rest.alt;
  // Only the two optional picture keys were removed, so `rest` is still a `T` without them.
  return { ...rest, ...picked } as unknown as T;
}

// Add, replace or remove one picture (of a choice, matching item or background) and describe it. The description
// (alt text) is needed before the quiz can be saved; the box turns red until there is one.
export function ImageField({
  imageId,
  alt,
  onChange,
  label,
}: {
  imageId: string | undefined;
  alt: string | undefined;
  onChange: (picked: PickedImage) => void;
  // Names the controls for screen readers, e.g. "Choice A".
  label: string;
}) {
  const initial = useContext(EditorAssetUrls);
  const { urls } = useAssetUrls(initial, imageId ? [imageId] : []);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File) {
    setError(null);
    setBusy(true);
    try {
      const uploaded = await uploadImage(file, "question");
      // A replaced picture keeps its description until the teacher changes it.
      onChange({ imageId: uploaded.assetId, alt: alt ?? "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The image couldn't be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  const url = imageId ? urls[imageId] : undefined;
  return (
    <div className="space-y-1.5">
      <input
        ref={input}
        type="file"
        accept={assetMimes.join(",")}
        className="hidden"
        tabIndex={-1}
        aria-label={`Choose the image for ${label}`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void pick(file);
        }}
      />
      {imageId === undefined ? (
        <Button variant="secondary" className="py-1 text-xs" disabled={busy} onClick={() => input.current?.click()}>
          <ImagePlus className="size-4" /> {busy ? "Uploading…" : "Add image"}
        </Button>
      ) : (
        <div className="flex flex-wrap items-start gap-2">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={alt ?? ""} className="h-16 max-w-32 rounded border border-border object-contain" />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded border border-dashed border-border text-xs text-muted">
              Image
            </div>
          )}
          <div className="min-w-40 flex-1 space-y-1.5">
            <input
              value={alt ?? ""}
              onChange={(e) => onChange({ imageId, alt: e.target.value })}
              placeholder="Describe the image (required)"
              aria-label={`Alt text for ${label}`}
              aria-invalid={!(alt ?? "").trim()}
              className={clsx(inputClass, !(alt ?? "").trim() && "border-danger")}
            />
            <div className="flex gap-1">
              <Button variant="ghost" className="py-0.5 text-xs" disabled={busy} onClick={() => input.current?.click()}>
                {busy ? "Uploading…" : "Replace"}
              </Button>
              <Button variant="ghost" className="py-0.5 text-xs text-danger" aria-label={`Remove image from ${label}`} onClick={() => onChange({})}>
                <Trash2 className="size-3.5" /> Remove
              </Button>
            </div>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
