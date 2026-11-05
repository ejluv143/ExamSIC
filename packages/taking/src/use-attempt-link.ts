import { useEffect, useRef } from "react";
import type { AttemptLink } from "./attempt-link.ts";

// Runs the attempt link (see ./attempt-link.ts) while `active`. `onRefused` is read when the answer comes, so it
// may change between renders; `onWake` should be stable.
export function useAttemptLink({
  link,
  active,
  onRefused,
  onWake,
}: {
  link: AttemptLink;
  active: boolean;
  onRefused?: ((message: string | null) => void) | undefined;
  onWake?: ((beat: () => void) => () => void) | undefined;
}) {
  const refusedRef = useRef(onRefused);
  useEffect(() => {
    refusedRef.current = onRefused;
  });
  useEffect(() => {
    if (!active) return;
    return link.run({ onRefused: (message) => refusedRef.current?.(message), onWake });
  }, [active, link, onWake]);
}
