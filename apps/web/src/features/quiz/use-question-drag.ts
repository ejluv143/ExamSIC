// Dragging a question to another place or part, for the cards and the table alike: what is being dragged, where it
// would land, and the drop. The move itself is the editing module's `moveQuestionTo`; this is only the pointer side.
import { useState, type DragEvent } from "react";

type Over = { partId: string; index: number };

export function useQuestionDrag(move: (questionId: string, partId: string, index: number) => void) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Over | null>(null);

  const reset = () => {
    setDragId(null);
    setOver(null);
  };

  return {
    dragId,
    // Whether something is being dragged and would land in this part.
    activeIn: (partId: string) => dragId !== null && over?.partId === partId,

    // Where the drop line shows for the question at `index` of a part with `count` questions.
    marker(partId: string, index: number, count: number): "before" | "after" | null {
      if (dragId === null || over?.partId !== partId) return null;
      if (over.index === index) return "before";
      return over.index === index + 1 && index === count - 1 ? "after" : null;
    },

    start(e: DragEvent<HTMLElement>, questionId: string, image?: HTMLElement | null) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", questionId);
      if (image) e.dataTransfer.setDragImage(image, 16, 16);
      setDragId(questionId);
    },
    end: reset,

    // Over a question: the top half drops before it, the bottom half after it.
    overQuestion(e: DragEvent<HTMLElement>, partId: string, index: number) {
      if (!dragId) return;
      e.preventDefault();
      e.stopPropagation();
      const box = e.currentTarget.getBoundingClientRect();
      setOver({ partId, index: e.clientY < box.top + box.height / 2 ? index : index + 1 });
    },
    // Over the part itself (its header, an empty part, the space under its questions): lands at `index`.
    overPart(e: DragEvent<HTMLElement>, partId: string, index: number) {
      if (!dragId) return;
      e.preventDefault();
      setOver({ partId, index });
    },
    // Leaving the part (not just moving onto one of its children).
    leavePart(e: DragEvent<HTMLElement>) {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
    },
    // Dropped: where the line showed if it was in this part, else `fallback`.
    drop(e: DragEvent<HTMLElement>, partId: string, fallback: number) {
      e.preventDefault();
      e.stopPropagation();
      if (dragId) move(dragId, partId, over?.partId === partId ? over.index : fallback);
      reset();
    },
  };
}
