import clsx from "clsx";

// A ring that fills to the percent. The colour follows how well it went, so the number isn't the only signal.
export function ScoreGauge({ percent, label, sublabel }: { percent: number; label: string; sublabel: string }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const shown = Math.min(100, Math.max(0, percent));
  const tone = shown >= 75 ? "text-success" : shown >= 50 ? "text-warning" : "text-danger";
  return (
    <div className="relative size-36 shrink-0" role="img" aria-label={`${label}: ${percent}%. ${sublabel}`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" className="stroke-surface-muted" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
          className={clsx("stroke-current transition-[stroke-dashoffset] duration-700", tone)}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center" aria-hidden>
        <span className="text-3xl font-semibold tabular-nums">{percent}%</span>
        <span className="text-xs text-muted">{sublabel}</span>
      </div>
    </div>
  );
}
