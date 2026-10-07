"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAssetUrls } from "@/app/assets/actions";

// Signed URLs last ten minutes; ask again a little before that.
const refreshMs = 8 * 60_000;

// The signed URLs of images shown in a client component. `initial` is what the server rendered the page with
// (the paper's `assetUrls`); ids it doesn't have (an image just uploaded) are fetched, and every known id is
// refreshed before its URL expires so a long exam never loses its pictures. `add` takes URLs already in hand.
export function useAssetUrls(initial: Record<string, string>, ids: readonly string[] = []) {
  const [urls, setUrls] = useState(initial);
  const known = useRef(new Set([...Object.keys(initial), ...ids]));
  const have = useRef(new Set(Object.keys(initial)));

  const wanted = ids.join(",");
  useEffect(() => {
    for (const id of ids) known.current.add(id);
    const missing = ids.filter((id) => !have.current.has(id));
    if (missing.length === 0) return;
    // Asked for once per id, even when S3 has no URL to give (an image the user may not see).
    for (const id of missing) have.current.add(id);
    void fetchAssetUrls(missing).then((fresh) => setUrls((current) => ({ ...current, ...fresh })));
    // `ids` is covered by `wanted`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);

  useEffect(() => {
    const timer = setInterval(() => {
      void fetchAssetUrls([...known.current]).then((fresh) => setUrls((current) => ({ ...current, ...fresh })));
    }, refreshMs);
    return () => clearInterval(timer);
  }, []);

  const add = useCallback((more: Record<string, string>) => {
    for (const id of Object.keys(more)) {
      known.current.add(id);
      have.current.add(id);
    }
    setUrls((current) => ({ ...current, ...more }));
  }, []);

  return { urls, add };
}
