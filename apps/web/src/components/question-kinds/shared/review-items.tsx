import { Markdown } from "@/components/markdown";

// A choice or matching item as the question bank shows it: its picture (or the alt text when there is no URL) and
// its text.
export function ItemView({ item, urls }: { item: { text: string; imageId?: string; alt?: string }; urls: Record<string, string> }) {
  return (
    <span className="inline-flex flex-col gap-1">
      {item.imageId !== undefined && <PickedImage url={urls[item.imageId] ?? null} alt={item.alt} />}
      {(item.imageId === undefined || item.text.trim()) && <Markdown inline assetUrls={urls}>{item.text}</Markdown>}
    </span>
  );
}

export function PickedImage({ url, alt }: { url: string | null; alt: string | undefined }) {
  return url ? (
    // Signed, short-lived URLs from another origin: next/image's optimiser doesn't apply.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt ?? ""} className="max-h-24 max-w-48 rounded border border-border object-contain" />
  ) : (
    <span className="text-xs">[image: {alt || "no description"}]</span>
  );
}
