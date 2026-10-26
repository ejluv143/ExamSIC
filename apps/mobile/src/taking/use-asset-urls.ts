// The signed URLs of images shown on a screen. `initial` is what the paper came with; ids it doesn't have (an image
// just uploaded) are fetched, and every known id is refreshed before its URL expires (they last ten minutes) so a long
// quiz never loses its pictures. `add` takes URLs already in hand.
import { useCallback, useEffect, useRef, useState } from "react";
import { callApi } from "@/lib/api";

const refreshMs = 8 * 60_000;

async function fetchUrls(ids: readonly string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  try {
    return { ...(await callApi((api) => api["asset.urls"]({ assetIds: ids }))) };
  } catch {
    // Offline or S3 isn't set up: the pictures show their alt text.
    return {};
  }
}

export function useAssetUrls(initial: Readonly<Record<string, string>>, ids: readonly string[] = []) {
  const [urls, setUrls] = useState<Record<string, string>>({ ...initial });
  const known = useRef(new Set([...Object.keys(initial), ...ids]));
  const have = useRef(new Set(Object.keys(initial)));

  // The paper can be read again with more URLs than it first had (before Start it has none): take the new ones in.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setUrls((current) => ({ ...current, ...initial }));
  }
  useEffect(() => {
    for (const id of Object.keys(initial)) {
      known.current.add(id);
      have.current.add(id);
    }
  }, [initial]);

  const wanted = ids.join(",");
  useEffect(() => {
    for (const id of ids) known.current.add(id);
    const missing = ids.filter((id) => !have.current.has(id));
    if (missing.length === 0) return;
    // Asked for once per id, even when there is no URL to give (an image the student may not see).
    for (const id of missing) have.current.add(id);
    void fetchUrls(missing).then((fresh) => setUrls((current) => ({ ...current, ...fresh })));
    // `ids` is covered by `wanted`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);

  useEffect(() => {
    const timer = setInterval(() => {
      void fetchUrls([...known.current]).then((fresh) => setUrls((current) => ({ ...current, ...fresh })));
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
