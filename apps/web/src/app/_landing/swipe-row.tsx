"use client";

import { Children, isValidElement, useRef, useState, type ReactNode } from "react";

// On phones a row of cards you swipe sideways, one card at a time with the next one peeking in, and dots
// below; from `until` up it's the grid in `className`. Each card should take `swipeItem[until]` (theme.tsx);
// aria-hidden children, like a decorative track, aren't cards.
const row = {
  sm: "-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:snap-none sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden",
  md: "-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:snap-none md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden",
};
const dots = { sm: "sm:hidden", md: "md:hidden" };

export function SwipeRow({
  as: Tag = "div",
  until = "sm",
  label,
  className,
  children,
}: {
  as?: "div" | "ol" | "ul";
  until?: "sm" | "md";
  label: string;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState(0);
  const count = Children.toArray(children).filter(
    (child) => !(isValidElement<{ "aria-hidden"?: unknown }>(child) && child.props["aria-hidden"]),
  ).length;
  const cards = () => [...(ref.current?.children ?? [])].filter((el) => !el.hasAttribute("aria-hidden")) as HTMLElement[];

  // How far a card is from where a snapped card sits: just inside the row's left padding.
  const offset = (el: HTMLElement, item: HTMLElement) =>
    item.getBoundingClientRect().left - el.getBoundingClientRect().left - parseFloat(getComputedStyle(el).paddingLeft);

  // The card nearest that spot is the current one; at the end of the row, the last card is.
  const onScroll = () => {
    const el = ref.current;
    const items = cards();
    if (!el || items.length === 0) return;
    const distances = items.map((item) => Math.abs(offset(el, item)));
    let best = distances.indexOf(Math.min(...distances));
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) best = items.length - 1;
    setCurrent(best);
  };

  const goTo = (i: number) => {
    const el = ref.current;
    const item = cards()[i];
    if (el && item) el.scrollTo({ left: el.scrollLeft + offset(el, item), behavior: "smooth" });
  };

  return (
    <>
      <Tag
        ref={ref as never}
        onScroll={onScroll}
        aria-label={label}
        className={`${row[until]} ${className}`}
      >
        {children}
      </Tag>
      <div className={`mt-4 flex justify-center gap-1.5 ${dots[until]}`}>
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Show card ${i + 1} of ${count}`}
            aria-current={i === current}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === current ? "w-6 bg-gradient-to-r from-[#c0c1ff] to-[#4edea3]" : "w-1.5 bg-white/20 hover:bg-white/40"
            }`}
          />
        ))}
      </div>
    </>
  );
}
