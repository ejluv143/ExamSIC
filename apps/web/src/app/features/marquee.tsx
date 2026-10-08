import { categories } from "./data";

const all = categories.flatMap((cat) => cat.features.map((f) => ({ ...f, tone: cat.tone })));
const rows = [all.filter((_, i) => i % 2 === 0), all.filter((_, i) => i % 2 === 1)];

// Two rows of feature names drifting in opposite directions. Each row is doubled so the loop has no seam.
export function FeatureMarquee() {
  return (
    <div aria-hidden className="space-y-3 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
      {rows.map((row, r) => (
        <div key={r} className="flex overflow-hidden">
          <ul className={`flex shrink-0 animate-marquee gap-3 pr-3 ${r === 1 ? "[animation-direction:reverse]" : ""}`}>
            {[...row, ...row].map((f, i) => (
              <li
                key={i}
                className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-[#0b1326]/70 px-3.5 py-2 text-sm whitespace-nowrap text-[#dae2fd] backdrop-blur"
              >
                <f.icon className="size-4" style={{ color: f.tone }} />
                {f.title}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
