import clsx from "clsx";
import { classColors } from "@examinus/domain/classes";
import type { Class } from "@/features/classes/types";

const tones = ["bg-primary-soft text-primary", "bg-success-soft text-success", "bg-info-soft text-info", "bg-warning-soft text-warning"];

// A class's course code initials on a tile; its colour is stable per class (picked from a hash of the id).
export function ClassMonogram({ cls, className }: { cls: Pick<Class, "id" | "courseCode" | "color">; className?: string }) {
  const tone = tones[[...cls.id].reduce((n, ch) => n + ch.charCodeAt(0), 0) % tones.length];
  // 2.5rem unless the caller sets its own size.
  const sizeClass = className?.includes("size-") ? undefined : "size-10";
  if (cls.color)
    return (
      <span
        className={clsx("grid shrink-0 place-items-center rounded-xl text-sm font-semibold text-white", sizeClass, className)}
        style={{ backgroundImage: `linear-gradient(135deg, ${classColors[cls.color].from}, ${classColors[cls.color].to})` }}
        aria-hidden
      >
        {cls.courseCode.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "—"}
      </span>
    );
  return (
    <span className={clsx("grid shrink-0 place-items-center rounded-xl text-sm font-semibold", sizeClass, tone, className)} aria-hidden>
      {cls.courseCode.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "—"}
    </span>
  );
}
