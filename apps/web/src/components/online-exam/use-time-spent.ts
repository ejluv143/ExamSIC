import { useEffect, useRef } from "react";

// How long each question has been on screen (with the page visible), sent with its answers for the too-fast check.
// `questionsRef` goes on the element that holds the question cards (each marked `data-question-id`); `timeSpentRef`
// then answers for a question id. `servedKey` changes when other questions come on screen.
export function useTimeSpent({ active, servedKey }: { active: boolean; servedKey: string }) {
  const spent = useRef<Record<string, number>>({});
  const shownSince = useRef(new Map<string, number>());
  const questionsRef = useRef<HTMLDivElement>(null);
  const timeSpentRef = useRef<(id: string) => number>(() => 0);
  useEffect(() => {
    const root = questionsRef.current;
    if (!active || !root) return;
    const onScreen = new Set<string>();
    const stop = (id: string) => {
      const since = shownSince.current.get(id);
      if (since === undefined) return;
      spent.current[id] = (spent.current[id] ?? 0) + Date.now() - since;
      shownSince.current.delete(id);
    };
    const begin = (id: string) => {
      if (document.visibilityState === "visible" && !shownSince.current.has(id)) shownSince.current.set(id, Date.now());
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.questionId;
          if (!id) continue;
          if (e.isIntersecting) {
            onScreen.add(id);
            begin(id);
          } else {
            onScreen.delete(id);
            stop(id);
          }
        }
      },
      { threshold: 0.1 },
    );
    root.querySelectorAll("[data-question-id]").forEach((el) => observer.observe(el));
    const onVisibility = () => onScreen.forEach((id) => (document.visibilityState === "visible" ? begin(id) : stop(id)));
    timeSpentRef.current = (id) => {
      const since = shownSince.current.get(id);
      return Math.round((spent.current[id] ?? 0) + (since === undefined ? 0 : Date.now() - since));
    };
    document.addEventListener("visibilitychange", onVisibility);
    const open = shownSince.current;
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      for (const id of [...open.keys()]) stop(id);
    };
  }, [active, servedKey]);
  return { questionsRef, timeSpentRef };
}
