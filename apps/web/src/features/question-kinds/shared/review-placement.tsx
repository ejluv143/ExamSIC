import { Check, X } from "lucide-react";
import { AssetImage } from "@/components/asset-image";
import { Markdown } from "@/components/markdown";

type Item = { text: string; imageId?: string; alt?: string };

// An item of a sorting or ordering answer: its text and picture.
export function ItemContent({ item, assetUrls }: { item: Item | undefined; assetUrls: Record<string, string> }) {
  if (!item) return null;
  return (
    <span className="min-w-0 flex-1">
      {item.text && (
        <Markdown inline assetUrls={assetUrls}>
          {item.text}
        </Markdown>
      )}
      {item.imageId && (
        <AssetImage id={item.imageId} alt={item.alt ?? ""} assetUrls={assetUrls} className="mt-1 block max-h-24" />
      )}
    </span>
  );
}

export function Mark({ correct }: { correct: boolean }) {
  return correct ? (
    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Correct" />
  ) : (
    <X className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Wrong" />
  );
}
