import { useEffect, useRef } from "react";
import { createTimeSpent } from "@examinus/taking/time-spent";

// How long each question has been on screen (with the page visible), sent with its answers for the too-fast check.
// `questionsRef` goes on the element that holds the question cards (each marked `data-question-id`); `timeSpentRef`
// then answers for a question id. `servedKey` changes when other questions come on screen. The adding up is
// `createTimeSpent`; this tells it what the browser shows.
export function useTimeSpent({ active, servedKey }: { active: boolean; servedKey: string }) {
  const timeSpent = useRef(createTimeSpent());
  const questionsRef = useRef<HTMLDivElement>(null);
  const timeSpentRef = useRef<(id: string) => number>(() => 0);
  useEffect(() => {
    const root = questionsRef.current;
    if (!active || !root) return;
    const spent = timeSpent.current;
    const onScreen = new Set<string>();
    const begin = (id: string) => {
      if (document.visibilityState === "visible") spent.show(id);
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
            spent.hide(id);
          }
        }
      },
      { threshold: 0.1 },
    );
    root.querySelectorAll("[data-question-id]").forEach((el) => observer.observe(el));
    const onVisibility = () => onScreen.forEach((id) => (document.visibilityState === "visible" ? begin(id) : spent.hide(id)));
    timeSpentRef.current = spent.snapshot;
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      onScreen.forEach((id) => spent.hide(id));
    };
  }, [active, servedKey]);
  return { questionsRef, timeSpentRef };
}
