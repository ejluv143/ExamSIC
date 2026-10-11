import { revealDelay } from "./reveal";

// A section's eyebrow, title and lead: on the left with the lead beside it on wide screens, centred on phones.
export function SectionHeading({ id, eyebrow, title, text }: { id: string; eyebrow: string; title: string; text?: string }) {
  return (
    <div className="grid gap-4 text-center lg:grid-cols-[1.1fr_1fr] lg:items-end lg:gap-12 lg:text-left">
      <div data-reveal>
        <p className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-primary uppercase">
          <span aria-hidden className="h-px w-6 bg-primary" />
          {eyebrow}
        </p>
        <h2 id={id} className="mt-3 scroll-mt-28 font-display text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
          {title}
        </h2>
      </div>
      {text && (
        <p data-reveal style={revealDelay(120)} className="mx-auto max-w-xl text-lg text-pretty text-muted lg:mx-0">
          {text}
        </p>
      )}
    </div>
  );
}
