"use client";

import type { ReactNode } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp } from "lucide-react";

export type SortDir = "asc" | "desc";


// A sortable table header cell for a table sorted in the browser: a plain button inside a th. Pass the th's own
// classes through `className`.
export function SortHeader({
  active,
  dir,
  onSort,
  className,
  align = "left",
  children,
}: {
  active: boolean;
  dir: SortDir;
  onSort: () => void;
  className?: string;
  align?: "left" | "right";
  children: ReactNode;
}) {
  const Icon = dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={clsx("font-medium", className)} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={onSort}
        className={clsx(
          "-mx-1 inline-flex items-center gap-1 rounded px-1 uppercase hover:text-foreground focus-visible:outline-2",
          align === "right" && "flex-row-reverse",
          active && "text-foreground",
        )}
      >
        {children}
        <Icon className={clsx("size-3.5", !active && "opacity-0")} aria-hidden />
      </button>
    </th>
  );
}

