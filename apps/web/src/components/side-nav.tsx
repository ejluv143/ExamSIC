"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { ClassMonogram } from "@/components/class-monogram";
import type { Class } from "@/features/classes/types";

export type NavChild = {
  href: string;
  label: string;
  // A second line under the label (a class's section).
  detail?: string;
  // A class's tile, shown beside its name.
  monogram?: Pick<Class, "id" | "courseCode" | "color">;
};
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  // Links shown under the item, which a chevron next to it shows and hides (the choice is remembered).
  children?: NavChild[];
};

const storageKey = (href: string) => `examinus.nav.open:${href}`;

// Whether a group is open lives in localStorage (open unless saved as closed); the server render, and a browser
// that blocks storage, show it open.
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
function readOpen(href: string) {
  try {
    return localStorage.getItem(storageKey(href)) !== "0";
  } catch {
    return true;
  }
}
function saveOpen(href: string, open: boolean) {
  try {
    localStorage.setItem(storageKey(href), open ? "1" : "0");
  } catch {}
  listeners.forEach((fn) => fn());
}

// Icons are components, so each role's item list lives in its own client file and is passed in here. In the
// collapsed sidebar (`rail:`) only the icons show; the label stays for screen readers and as the tooltip, and the
// children are left out.
export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => (
        <NavRow key={item.href} item={item} pathname={pathname} />
      ))}
    </nav>
  );
}

function NavRow({ item, pathname }: { item: NavItem; pathname: string }) {
  const { href, label, icon: Icon, exact, children } = item;
  const open = useSyncExternalStore(subscribe, () => readOpen(href), () => true);

  const childActive = (c: NavChild) => pathname === c.href || pathname.startsWith(`${c.href}/`);
  const onChild = children?.some(childActive) ?? false;
  const active = (exact ? pathname === href : pathname.startsWith(href)) && !onChild;

  const toggle = () => saveOpen(href, !open);

  const link = (
    <Link
      href={href}
      title={label}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors rail:justify-center rail:px-0",
        active ? "bg-primary text-primary-foreground shadow-depth" : "text-muted hover:bg-surface-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="rail:sr-only">{label}</span>
    </Link>
  );

  if (!children?.length) return link;

  const listId = `nav-children-${href.replace(/\W+/g, "-")}`;
  return (
    <div>
      <div className="flex items-center gap-0.5">
        {link}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={listId}
          aria-label={open ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-muted hover:text-foreground rail:hidden"
        >
          <ChevronDown className={clsx("size-4 transition-transform", !open && "-rotate-90")} aria-hidden />
        </button>
      </div>
      {open && (
        <ul id={listId} className="mt-1 ml-5 flex flex-col gap-0.5 border-l border-border pl-2 rail:hidden">
          {children.map((c) => {
            const here = childActive(c);
            return (
              <li key={c.href}>
                <Link
                  href={c.href}
                  title={c.label}
                  aria-current={here ? "page" : undefined}
                  className={clsx(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                    here ? "bg-primary-soft font-medium text-primary" : "text-muted hover:bg-surface-muted hover:text-foreground",
                  )}
                >
                  {c.monogram && <ClassMonogram cls={c.monogram} className="size-7 rounded-lg text-[10px]" />}
                  <span className="min-w-0">
                    <span className="block truncate">{c.label}</span>
                    {c.detail && <span className="block truncate text-xs font-normal text-muted">{c.detail}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
