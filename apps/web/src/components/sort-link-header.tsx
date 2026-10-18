// A table sorted on the server: header cells are plain links, so sorting works without JavaScript. Server components
// render these (a function `href` can't cross into a client component).
import Link from "next/link";
import clsx from "clsx";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { SortDir } from "./sort-header";

export type { SortDir };
export type SortState<K extends string> = { key: K; dir: SortDir };

// The link a column header points at: the same column flips its direction, another column starts at its natural one.
export function sortLink<K extends string>(current: SortState<K>, key: K, naturalDir: SortDir, href: (next: SortState<K>) => string): string {
  const dir: SortDir = current.key === key ? (current.dir === "asc" ? "desc" : "asc") : naturalDir;
  return href({ key, dir });
}

// A header cell for a table sorted on the server: a plain link, so it works without JavaScript.
export function SortableHeader<K extends string>({
  label,
  sortKey,
  naturalDir = "asc",
  current,
  href,
  className,
}: {
  label: string;
  sortKey: K;
  naturalDir?: SortDir;
  current: SortState<K>;
  href: (next: SortState<K>) => string;
  className?: string;
}) {
  const active = current.key === sortKey;
  const Icon = !active ? ChevronsUpDown : current.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (current.dir === "asc" ? "ascending" : "descending") : "none"} className={clsx("px-3 py-2 text-left font-medium", className)}>
      <Link
        href={sortLink(current, sortKey, naturalDir, href)}
        className={clsx("inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary", active && "text-foreground")}
      >
        {label}
        <Icon className={clsx("size-3.5", !active && "opacity-50")} aria-hidden />
      </Link>
    </th>
  );
}
