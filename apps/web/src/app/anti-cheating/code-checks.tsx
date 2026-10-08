import { AlertTriangle, Keyboard, Pause, ScanSearch } from "lucide-react";
import { c } from "../_landing/theme";

// How a code answer was written, as a timeline: steady typing, then a block that appeared at once.
export function TypingReplay() {
  const segments: { w: string; kind: "typed" | "pause" | "paste" }[] = [
    { w: "w-[22%]", kind: "typed" },
    { w: "w-[8%]", kind: "pause" },
    { w: "w-[18%]", kind: "typed" },
    { w: "w-[6%]", kind: "paste" },
    { w: "w-[14%]", kind: "typed" },
  ];
  const tone = { typed: "bg-[#4edea3]/70", pause: "bg-white/10", paste: "bg-[#ffb4ab]" };
  return (
    <div className="h-full rounded-3xl border border-white/10 bg-[#131b2e] p-6">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-[#4edea3]/15 text-[#4edea3]">
          <Keyboard className="size-5" aria-hidden />
        </span>
        <h3 className="font-display text-lg font-semibold">Typing replay</h3>
      </div>
      <p className={`mt-2 text-sm leading-relaxed ${c.muted}`}>
        Watch a code answer being written, keystroke by keystroke. Big blocks that appear at once and typing faster than a person can
        are flagged.
      </p>
      <div aria-hidden className="mt-5 rounded-2xl bg-[#060e20] p-4">
        <pre className="font-mono text-[12px] leading-relaxed text-[#dae2fd]">
          <span className="text-[#d0bcff]">def</span> sum_even(nums):{"\n"}
          {"    "}total = <span className="text-[#ffb68a]">0</span>
          {"\n"}
          <span className="rounded bg-[#ffb4ab]/20 text-[#ffb4ab]">
            {"    "}for n in nums:{"\n"}
            {"        "}if n % 2 == 0: total += n
          </span>
          <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] animate-caret bg-[#4edea3]" />
        </pre>
        <div className="mt-4 flex items-center gap-2">
          <Pause className="size-4 text-[#c7c4d7]" />
          <div className="relative flex h-2 flex-1 gap-0.5 overflow-hidden rounded-full">
            {segments.map((s, i) => (
              <span key={i} className={`h-full rounded-full ${s.w} ${tone[s.kind]}`} />
            ))}
          </div>
          <span className="font-mono text-[11px] text-[#c7c4d7]">03:42</span>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[#ffb4ab]">
          <AlertTriangle className="size-3.5" /> 52 characters appeared at once at 02:58
        </p>
      </div>
    </div>
  );
}

// Two answers that differ only in names: the check compares structure, so the copy still shows up.
export function SimilarityCheck() {
  return (
    <div className="h-full rounded-3xl border border-white/10 bg-[#131b2e] p-6">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-[#d0bcff]/15 text-[#d0bcff]">
          <ScanSearch className="size-5" aria-hidden />
        </span>
        <h3 className="font-display text-lg font-semibold">Similarity check</h3>
      </div>
      <p className={`mt-2 text-sm leading-relaxed ${c.muted}`}>
        Code and SQL answers are compared by their structure, ignoring names and comments, so a renamed copy still shows up. Answers
        everyone writes the same way are ignored.
      </p>
      <div aria-hidden className="mt-5 grid grid-cols-2 gap-2">
        {[
          ["Cruz, Bea", "nums", "total", "n"],
          ["Lim, Paolo", "values", "s", "x"],
        ].map(([who, a, b, v]) => (
          <div key={who} className="rounded-2xl bg-[#060e20] p-3">
            <p className={`mb-2 text-[11px] font-semibold ${c.muted}`}>{who}</p>
            <pre className="font-mono text-[11px] leading-relaxed text-[#dae2fd]">
              def f(<mark className="rounded bg-[#d0bcff]/25 text-[#d0bcff]">{a}</mark>):{"\n"}
              {"  "}
              <mark className="rounded bg-[#d0bcff]/25 text-[#d0bcff]">{b}</mark> = 0{"\n"}
              {"  "}for <mark className="rounded bg-[#d0bcff]/25 text-[#d0bcff]">{v}</mark> in {a}:{"\n"}
              {"    "}
              {b} += {v}
            </pre>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl border border-[#d0bcff]/30 bg-[#d0bcff]/10 px-3 py-2 text-xs">
        <span className="text-[#d0bcff]">Same structure, different names</span>
        <span className="font-display text-base font-bold text-[#d0bcff]">94% alike</span>
      </div>
    </div>
  );
}
