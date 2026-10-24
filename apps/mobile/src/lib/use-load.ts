import { useCallback, useEffect, useRef, useState } from "react";

export type Loaded<A> = {
  data: A | null;
  error: string | null;
  // The first load, with nothing to show yet.
  loading: boolean;
  // A pull-to-refresh in progress.
  refreshing: boolean;
  refresh: () => Promise<void>;
};

// Loads something when the screen opens and again on pull-to-refresh. `load` should be stable (declared outside the
// component or in `useCallback`).
export function useLoad<A>(load: () => Promise<A>): Loaded<A> {
  const [data, setData] = useState<A | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const run = useCallback(async () => {
    try {
      const value = await load();
      if (!mounted.current) return;
      setData(value);
      setError(null);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }, [load]);

  useEffect(() => {
    mounted.current = true;
    void run().finally(() => mounted.current && setLoading(false));
    return () => {
      mounted.current = false;
    };
  }, [run]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await run();
    if (mounted.current) setRefreshing(false);
  }, [run]);

  return { data, error, loading, refreshing, refresh };
}
