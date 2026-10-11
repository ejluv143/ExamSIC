import clsx from "clsx";
import type { Class } from "@/lib/types";

const tones = ["bg-primary-soft text-primary", "bg-success-soft text-success", "bg-info-soft text-info", "bg-warning-soft text-warning"];

// A class's course code initials on a tile; its colour is stable per class (picked from a hash of the id).
export function ClassMonogram({ cls, className }: { cls: Pick<Class, "id" | "courseCode">; className?: string }) {
  const tone = tones[[...cls.id].reduce((n, ch) => n + ch.charCodeAt(0), 0) % tones.length];
  return (
    <span className={clsx("grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold", tone, className)} aria-hidden>
      {cls.courseCode.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "—"}
    </span>
  );
}
