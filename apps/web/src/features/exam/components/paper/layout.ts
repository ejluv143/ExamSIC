import type { ReactNode } from "react";
import type { PaperSize } from "@examinus/domain/quiz";

// Measurements follow the school's Word template. Lengths are in inches, as on the printed page.
export const pageSizes: Record<PaperSize, { label: string; width: number; height: number }> = {
  long: { label: "Long (8.5 × 13 in)", width: 8.5, height: 13 },
  letter: { label: "Short / Letter (8.5 × 11 in)", width: 8.5, height: 11 },
  a4: { label: "A4 (8.27 × 11.69 in)", width: 8.27, height: 11.69 },
};
export const PX = 96; // CSS pixels per inch, on screen and in print
export const body = { left: 0.75, right: 0.7 };
export const wide = { left: 0.25, right: 0.2 };
export const firstPageTop = 0.4;
export const otherPageTop = 0.65;
export const footerBottom = 0.17;
export const footerSpace = 1.0; // the content area stops this far from the bottom edge

export const fonts = {
  sans: 'Calibri, Carlito, "Segoe UI", Arial, sans-serif',
  serif: '"Times New Roman", "Liberation Serif", Tinos, Times, serif',
  narrow: '"Arial Narrow", "Liberation Sans Narrow", "Nimbus Sans Narrow", Arial, sans-serif',
};
export const navy = "#002060";

// The two documents the paper can print: the questions, or the answer sheet.
export type PaperDoc = "paper" | "sheet";

// One unit of the paper that is measured and placed on a page whole.
export type Block = {
  node: ReactNode;
  // Space above the block, in points; part of the block so measuring includes it.
  space?: number;
  inset?: { left: number; right: number };
  // Keep on the same page as the next block (part headings and their instructions).
  keepWithNext?: boolean;
};
