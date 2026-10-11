import {
  Brackets,
  CheckSquare,
  Code2,
  Database,
  Hash,
  ListOrdered,
  MousePointerClick,
  PenTool,
  Rows3,
  Shapes,
  SquarePen,
  TextCursorInput,
  ToggleLeft,
  type LucideIcon,
} from "lucide-react";

// The 13 question types, scrolling past in an endless strip (globals.css: .marquee). Two copies of the list follow
// each other so the loop has no seam; the second is hidden from screen readers.
const types: [LucideIcon, string][] = [
  [CheckSquare, "Multiple choice"],
  [ToggleLeft, "True or false"],
  [TextCursorInput, "Fill in the blank"],
  [Brackets, "Matching"],
  [ListOrdered, "Enumeration"],
  [Hash, "Numeric"],
  [SquarePen, "Essay"],
  [Code2, "Code"],
  [Database, "SQL"],
  [PenTool, "Drawing"],
  [Shapes, "Categorization"],
  [Rows3, "Ordering"],
  [MousePointerClick, "Hotspot"],
];

function Row({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-3 pr-3">
      {types.map(([Icon, name]) => (
        <li key={name} className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium whitespace-nowrap">
          <Icon className="size-4 text-primary" aria-hidden />
          {name}
        </li>
      ))}
    </ul>
  );
}

export function QuestionTypeMarquee() {
  return (
    <section aria-label="Question types" className="border-y border-border bg-surface-muted/50 py-6">
      <p className="mb-4 text-center text-xs font-semibold tracking-[0.18em] text-muted uppercase">13 question types, all graded for you</p>
      <div className="marquee flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
        <div className="marquee-track flex">
          <Row />
          <Row hidden />
        </div>
      </div>
    </section>
  );
}
