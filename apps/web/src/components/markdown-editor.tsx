"use client";

import clsx from "clsx";
import { Bold, Code, ImagePlus, Italic, Link2, List, ListOrdered, Sigma, TextCursorInput, type LucideIcon } from "lucide-react";
import { useRef, useState, type ClipboardEventHandler, type DragEvent } from "react";
import { assetIdsIn, assetMarkdown, assetMimes } from "@examora/contract";
import { uploadImage } from "@/lib/upload-image";
import { useAssetUrls } from "@/lib/use-asset-urls";
import { Button, inputClass } from "./ui";
import { Markdown } from "./markdown";

type Tool = { label: string; icon: LucideIcon; apply: (selected: string) => { text: string; select?: [number, number] } };

const wrap = (before: string, after: string, placeholder: string) => (selected: string) => {
  const inner = selected || placeholder;
  return { text: `${before}${inner}${after}`, select: [before.length, before.length + inner.length] as [number, number] };
};
const prefixLines = (prefix: (i: number) => string, placeholder: string) => (selected: string) => {
  const text = (selected || placeholder).split("\n").map((line, i) => prefix(i) + line).join("\n");
  return { text };
};

const tools: Tool[] = [
  { label: "Bold", icon: Bold, apply: wrap("**", "**", "bold") },
  { label: "Italic", icon: Italic, apply: wrap("*", "*", "italic") },
  { label: "Code", icon: Code, apply: wrap("`", "`", "code") },
  { label: "Bulleted list", icon: List, apply: prefixLines(() => "- ", "item") },
  { label: "Numbered list", icon: ListOrdered, apply: prefixLines((i) => `${i + 1}. `, "item") },
  { label: "Math", icon: Sigma, apply: wrap("$", "$", "x^2") },
  { label: "Link", icon: Link2, apply: (s) => ({ text: `[${s || "text"}](https://)`, select: [1, 1 + (s || "text").length] }) },
];

const blankTool: Tool = { label: "Insert blank", icon: TextCursorInput, apply: wrap("{{", "}}", "answer") };

const imageFile = (files: FileList) => [...files].find((f) => f.type.startsWith("image/"));
const hasFiles = (e: DragEvent<HTMLElement>) => [...e.dataTransfer.types].includes("Files");

// A text box for markdown with a small toolbar and a Preview tab. `blanks` adds the "Insert blank" button,
// which writes {{answer}} (or wraps the selected text).
export function MarkdownEditor({
  value,
  onChange,
  label,
  rows = 4,
  placeholder,
  blanks,
  onPaste,
  disabled,
  assetUrls,
  images,
}: {
  value: string;
  onChange: (value: string) => void;
  // Names the text box for screen readers.
  label: string;
  rows?: number;
  placeholder?: string;
  blanks?: boolean;
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>;
  disabled?: boolean;
  // Signed URLs of the images already in the text, as the server rendered the page with.
  assetUrls?: Record<string, string>;
  // Teachers' text only: adds the Insert image button and accepts dropped or pasted pictures. Students' answers
  // and feedback have no use for it (and students may not upload question images).
  images?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ assetId: string; at: number } | null>(null);
  const [alt, setAlt] = useState("");
  // The pictures in the text, and the one just uploaded (for its thumbnail).
  const { urls } = useAssetUrls(assetUrls ?? {}, [...assetIdsIn(value), ...(pending ? [pending.assetId] : [])]);

  function run(tool: Tool) {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const { text, select } = tool.apply(value.slice(start, end));
    onChange(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      const [a, b] = select ?? [text.length, text.length];
      el?.setSelectionRange(start + a, start + b);
    });
  }

  // Uploads a picked, dropped or pasted image. It is only written into the text once it has alt text.
  async function upload(file: File) {
    setError(null);
    if (!(assetMimes as readonly string[]).includes(file.type)) {
      setError("Use a PNG, JPEG, WebP or GIF image.");
      return;
    }
    setUploading(true);
    // Where the cursor was when the picture was chosen; the text box loses focus meanwhile.
    const at = ref.current?.selectionEnd ?? value.length;
    try {
      const uploaded = await uploadImage(file, "question");
      setAlt("");
      setPending({ assetId: uploaded.assetId, at });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The image couldn't be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  function insertImage() {
    if (!pending || !alt.trim()) return;
    const text = assetMarkdown(pending.assetId, alt.trim());
    const at = Math.min(pending.at, value.length);
    const before = value.slice(0, at);
    const lead = before === "" || before.endsWith("\n") ? "" : "\n";
    onChange(before + lead + text + "\n" + value.slice(at));
    setPending(null);
    setAlt("");
  }

  const tab = (active: boolean) =>
    clsx("rounded-md px-2.5 py-1 text-xs font-medium", active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-muted");

  return (
    <div
      className={clsx(
        "rounded-lg border bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
        dragging ? "border-primary ring-2 ring-primary/30" : "border-border",
      )}
      onDragOver={(e) => {
        if (!images || disabled || !hasFiles(e)) return;
        e.stopPropagation();
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        setDragging(false);
        const file = imageFile(e.dataTransfer.files);
        if (!images || disabled || !file) return;
        e.stopPropagation();
        e.preventDefault();
        void upload(file);
      }}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
        <button type="button" className={tab(!preview)} onClick={() => setPreview(false)}>
          Write
        </button>
        <button type="button" className={tab(preview)} onClick={() => setPreview(true)}>
          Preview
        </button>
        {!preview && (
          <div className="ml-auto flex flex-wrap items-center gap-0.5">
            {(blanks ? [...tools, blankTool] : tools).map((tool) => (
              <button
                key={tool.label}
                type="button"
                title={tool.label}
                aria-label={tool.label}
                disabled={disabled}
                onClick={() => run(tool)}
                className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
              >
                <tool.icon className="size-4" />
              </button>
            ))}
            {images && (
            <button
              type="button"
              title="Insert image"
              aria-label="Insert image"
              disabled={disabled || uploading}
              onClick={() => fileInput.current?.click()}
              className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
            >
              <ImagePlus className="size-4" />
            </button>
            )}
            {images && <input
              ref={fileInput}
              type="file"
              accept={assetMimes.join(",")}
              className="hidden"
              tabIndex={-1}
              aria-label="Choose an image to insert"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file);
              }}
            />}
          </div>
        )}
      </div>
      {pending && !preview && (
        <form
          className="flex flex-wrap items-center gap-2 border-b border-border bg-primary-soft/40 px-3 py-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            insertImage();
          }}
        >
          {urls[pending.assetId] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls[pending.assetId]} alt="" className="h-10 w-10 rounded border border-border object-cover" />
          )}
          <input
            autoFocus
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            aria-label="Describe the image (alt text)"
            placeholder="Describe the image for students who can't see it"
            className={clsx(inputClass, "min-w-48 flex-1")}
          />
          <Button type="submit" disabled={!alt.trim()}>
            Insert image
          </Button>
          <Button variant="ghost" onClick={() => setPending(null)}>
            Cancel
          </Button>
        </form>
      )}
      {(uploading || error) && !preview && (
        <p role={error ? "alert" : "status"} className={clsx("border-b border-border px-3 py-1.5 text-xs", error ? "text-danger" : "text-muted")}>
          {error ?? "Uploading image…"}
        </p>
      )}
      {preview ? (
        <div className="min-h-16 px-3 py-2 text-sm">
          {value.trim() ? (
            <Markdown assetUrls={urls} renderBlank={(_, answers) => <span className="rounded bg-primary-soft px-1.5 font-medium text-primary underline decoration-dotted">{answers.join(" | ") || "\u00a0\u00a0\u00a0\u00a0"}</span>}>{value}</Markdown>
          ) : (
            <p className="text-muted">Nothing to preview.</p>
          )}
        </div>
      ) : (
        <textarea
          ref={ref}
          aria-label={label}
          value={value}
          rows={rows}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            onPaste?.(e);
            const file = imageFile(e.clipboardData.files);
            if (!images || !file || disabled) return;
            e.preventDefault();
            void upload(file);
          }}
          className={clsx(inputClass, "block resize-y border-0 font-mono text-[13px] focus:ring-0")}
        />
      )}
    </div>
  );
}
