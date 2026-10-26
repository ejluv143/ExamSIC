// What the text inputs of an attempt do about paste, copy and menus: the rules of the session and where to report a
// refused paste. The sensors attach it while the attempt is taken (`mobile-sensors.ts`); `GuardedTextInput` reads it.
import type { IntegrityEmit } from "@examinus/taking/integrity";
import { useSyncExternalStore } from "react";

export type InputGuard = {
  emit: IntegrityEmit;
  blockPaste: boolean;
  allowPasteInCode: boolean;
  blockCopy: boolean;
  blockRightClick: boolean;
};

let current: InputGuard | null = null;
const listeners = new Set<() => void>();

// Makes `guard` the one in force; returns what removes it.
export function attachInputGuard(guard: InputGuard): () => void {
  current = guard;
  listeners.forEach((l) => l());
  return () => {
    if (current !== guard) return;
    current = null;
    listeners.forEach((l) => l());
  };
}

export function useInputGuard(): InputGuard | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => current,
  );
}
