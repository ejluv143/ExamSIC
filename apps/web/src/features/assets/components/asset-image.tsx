import clsx from "clsx";

// An uploaded picture by asset id, from the page's signed URLs. Without a URL (S3 isn't set up, or the link
// expired) the alt text stands in, as `Markdown` does for pictures in text.
export function AssetImage({
  id,
  alt,
  assetUrls,
  className,
}: {
  id: string;
  alt: string;
  assetUrls: Record<string, string>;
  className?: string;
}) {
  const url = assetUrls[id];
  if (!url)
    return (
      <span className="inline-block rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted">
        {alt || "Image"}
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={clsx("rounded-md", className)} />;
}
