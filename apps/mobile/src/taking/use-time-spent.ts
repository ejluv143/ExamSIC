// How long each question has been on screen (with the app in the foreground), sent with its answers for the
// too-fast check. The adding up is `createTimeSpent`; this tells it what a phone shows: a paper on one page counts
// the cards that are scrolled into view, one question at a time counts the question on screen.
import { createTimeSpent } from "@examinus/taking/time-spent";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { AppState, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

type Box = { y: number; h: number };

export function useTimeSpent({ active, sequentialId }: { active: boolean; sequentialId: string | null }) {
  const spent = useMemo(() => createTimeSpent(), []);
  const boxes = useRef(new Map<string, Box>());
  const view = useRef({ top: 0, height: 0 });
  const visible = useRef(new Set<string>());
  const foreground = useRef(AppState.currentState === "active");

  const refresh = useCallback(() => {
    const next = new Set<string>();
    if (active && foreground.current) {
      if (sequentialId !== null) next.add(sequentialId);
      else
        for (const [id, { y, h }] of boxes.current) {
          const overlap = Math.min(y + h, view.current.top + view.current.height) - Math.max(y, view.current.top);
          if (overlap > Math.min(h, view.current.height) * 0.1) next.add(id);
        }
    }
    for (const id of visible.current) if (!next.has(id)) spent.hide(id);
    for (const id of next) spent.show(id);
    visible.current = next;
  }, [active, sequentialId, spent]);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (state) => {
      foreground.current = state === "active";
      refresh();
    });
    return () => {
      sub.remove();
      for (const id of visible.current) spent.hide(id);
      visible.current = new Set();
    };
  }, [refresh, spent]);

  return {
    snapshot: spent.snapshot,
    // For the scroll view of a paper on one page.
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      view.current.top = e.nativeEvent.contentOffset.y;
      refresh();
    },
    onViewLayout: (e: LayoutChangeEvent) => {
      view.current.height = e.nativeEvent.layout.height;
      refresh();
    },
    // For each question card.
    cardLayout: (id: string) => (e: LayoutChangeEvent) => {
      boxes.current.set(id, { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height });
      refresh();
    },
  };
}
