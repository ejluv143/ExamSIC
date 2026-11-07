"use client";

import { useRef, useState, useTransition } from "react";
import { Check, ImagePlus, Palette, Trash2 } from "lucide-react";
import { classColorNames, classColors, type ClassColor } from "@examinus/domain/classes";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { fetchAssetUrls } from "@/features/assets/actions";
import { uploadImage } from "@/features/assets/upload-image";
import type { ClassFormState } from "../actions";

// Classroom's "Customize": a dialog on the banner with a live preview and a row of theme colours.
export function CustomizeAppearance({
  title,
  section,
  color,
  headerImage,
  headerUrl,
  save,
}: {
  title: string;
  section: string;
  color: ClassColor | null;
  // The picture behind the banner: its asset id and a signed URL to show it with.
  headerImage: string | null;
  headerUrl: string | null;
  save: (color: string, headerImage: string) => Promise<ClassFormState>;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<ClassColor | null>(color);
  const [image, setImage] = useState<{ id: string; url: string | null } | null>(
    headerImage ? { id: headerImage, url: headerUrl } : null,
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const { assetId } = await uploadImage(file, "question");
      const url = (await fetchAssetUrls([assetId]))[assetId] ?? null;
      setImage({ id: assetId, url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The photo couldn't be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  const gradient = (c: ClassColor | null) =>
    c ? `linear-gradient(135deg, ${classColors[c].from}, ${classColors[c].to})` : "linear-gradient(135deg, #4f46e5, #3730a3)";

  function close() {
    setOpen(false);
    setPicked(color);
    setImage(headerImage ? { id: headerImage, url: headerUrl } : null);
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow hover:bg-slate-100"
      >
        <Palette className="size-4" aria-hidden /> Customize
      </button>
      <Dialog open={open} onClose={close} title="Customize appearance" size="lg">
        <div className="space-y-5">
          <div
            className="flex h-32 flex-col justify-end rounded-xl bg-cover bg-center p-4 text-white"
            style={{
              backgroundImage: image?.url
                ? `linear-gradient(rgba(0,0,0,.4), rgba(0,0,0,.4)), url("${image.url}")`
                : gradient(picked),
            }}
          >
            <p className="truncate text-xl font-semibold">{title}</p>
            {section && <p className="text-sm opacity-90">{section}</p>}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">Select stream header image</p>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void upload(file);
                }}
              />
              <Button variant="secondary" disabled={uploading} onClick={() => fileInput.current?.click()}>
                <ImagePlus className="size-4" aria-hidden /> {uploading ? "Uploading…" : "Upload photo"}
              </Button>
              {image && (
                <Button variant="ghost" onClick={() => setImage(null)}>
                  <Trash2 className="size-4" aria-hidden /> Remove photo
                </Button>
              )}
            </div>
          </div>

          <fieldset>
            <legend className="mb-3 text-sm font-medium">Select theme color</legend>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setPicked(null)}
                aria-pressed={picked === null}
                title="Theme default"
                className="grid size-10 place-items-center rounded-full border-2 border-border bg-surface-muted text-xs text-muted aria-pressed:border-primary aria-pressed:text-primary"
              >
                {picked === null ? <Check className="size-4" aria-hidden /> : "Auto"}
              </button>
              {classColorNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setPicked(name)}
                  aria-pressed={picked === name}
                  title={classColors[name].label}
                  className="grid size-10 place-items-center rounded-full border-2 text-white ring-offset-2 ring-offset-surface aria-pressed:ring-2 aria-pressed:ring-primary"
                  style={{ backgroundImage: gradient(name), borderColor: classColors[name].to }}
                >
                  {picked === name && <Check className="size-5" aria-hidden />}
                  <span className="sr-only">{classColors[name].label}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={pending || uploading || (picked === color && (image?.id ?? null) === headerImage)}
              onClick={() =>
                start(async () => {
                  const result = await save(picked ?? "", image?.id ?? "");
                  if (result?.error) setError(result.error);
                  else setOpen(false);
                })
              }
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
