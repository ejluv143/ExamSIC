import type { RefObject } from "react";
import type { TakeMode } from "@examinus/taking/types";

// What the browser adds to taking an exam: the element that goes full screen, just the exam, so the site header
// and links stay out of view.
export type WebTakeMode = TakeMode & { fullscreenRoot: RefObject<HTMLElement | null> };
