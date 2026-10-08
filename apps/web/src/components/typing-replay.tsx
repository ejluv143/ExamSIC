"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, Pause, Play, SkipBack } from "lucide-react";
import { Button } from "@/components/ui";
import { analyzeTyping, applyEdit, typingFlagLabel, type TypingEdit } from "@/lib/typing";
import { CodeEditor, type EditorLanguage } from "./code-editor";

const checkpointEvery = 200;
const tickMs = 50;
// While playing, pauses longer than this are cut short so watching doesn't take as long as the exam.
const maxPauseMs = 3000;
const speeds = [1, 4, 16];

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// Plays back how a code or SQL answer was written, with what looked unusual marked on the timeline.
export function TypingReplay({
  initial,
  edits,
  final,
  language,
}: {
  initial: string;
  edits: readonly TypingEdit[];
  final: string;
  language: EditorLanguage;
}) {
  const analysis = useMemo(() => analyzeTyping(initial, edits, final), [initial, edits, final]);
  // Text after every 200th edit, so jumping anywhere replays at most 200 edits.
  const checkpoints = useMemo(() => {
    const out = [initial];
    let text = initial;
    edits.forEach((e, i) => {
      text = applyEdit(text, e);
      if ((i + 1) % checkpointEvery === 0) out.push(text);
    });
    return out;
  }, [initial, edits]);

  const [position, setPosition] = useState(edits.length);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  // The playback clock (ms into the attempt) and position, kept in refs for the timer.
  const head = useRef(edits.at(-1)?.[0] ?? 0);
  const pos = useRef(edits.length);
  const seek = (n: number) => {
    pos.current = n;
    head.current = n > 0 ? edits[n - 1][0] : 0;
    setPosition(n);
  };

  const text = useMemo(() => {
    const base = Math.floor(position / checkpointEvery);
    let t = checkpoints[base];
    for (let i = base * checkpointEvery; i < position; i++) t = applyEdit(t, edits[i]);
    return t;
  }, [position, checkpoints, edits]);

  const duration = edits.at(-1)?.[0] ?? 0;
  const now = position > 0 ? edits[position - 1][0] : 0;

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const p = pos.current;
      if (p >= edits.length) return setPlaying(false);
      let t = head.current + tickMs * speed;
      // Jump over long pauses instead of sitting through them.
      if (edits[p][0] - t > maxPauseMs) t = edits[p][0] - maxPauseMs;
      let next = p;
      while (next < edits.length && edits[next][0] <= t) next++;
      head.current = t;
      pos.current = next;
      setPosition(next);
    }, tickMs);
    return () => clearInterval(timer);
  }, [playing, speed, edits]);

  if (edits.length === 0) {
    return <p className="text-sm text-muted">No typing was recorded for this answer.</p>;
  }

  const at = (ms: number) => `${duration ? (ms / duration) * 100 : 0}%`;

  return (
    <div className="space-y-3">
      {analysis.flags.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-warning-soft p-3 text-sm text-warning">
          {analysis.flags.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {typingFlagLabel[f]}
              {f === "bulk_insert" &&
                ` (${analysis.bulkInserts.length}×, largest ${Math.max(...analysis.bulkInserts.map((b) => b.chars))} characters)`}
              {f === "robot_typing" && ` (up to ${Math.max(...analysis.robotRuns.map((r) => r.charsPerSecond))} characters a second)`}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          className="px-2.5 py-1.5 text-xs"
          onClick={() => {
            if (position >= edits.length) seek(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
          {playing ? "Pause" : "Play"}
        </Button>
        <Button
          variant="ghost"
          className="px-2 py-1.5 text-xs"
          aria-label="Back to the start"
          onClick={() => {
            setPlaying(false);
            seek(0);
          }}
        >
          <SkipBack className="size-3.5" aria-hidden />
        </Button>
        <div role="radiogroup" aria-label="Playback speed" className="inline-flex rounded-lg bg-surface-muted p-0.5 text-xs">
          {speeds.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={speed === s}
              onClick={() => setSpeed(s)}
              className={clsx("rounded-md px-2 py-1 font-medium", speed === s ? "bg-surface shadow-sm" : "text-muted")}
            >
              {s}×
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted tabular-nums">
          {clock(now)} / {clock(duration)} · edit {position} of {edits.length}
        </span>
      </div>

      {/* Timeline: red marks where large code appeared at once, amber where typing was robotically fast. */}
      <div className="relative">
        <input
          type="range"
          min={0}
          max={edits.length}
          value={position}
          onChange={(e) => {
            setPlaying(false);
            seek(Number(e.target.value));
          }}
          aria-label="Replay position"
          className="w-full accent-primary"
        />
        <div className="pointer-events-none relative h-2">
          {analysis.robotRuns.map((r, i) => (
            <span
              key={`r${i}`}
              className="absolute top-0 h-2 rounded-full bg-warning/70"
              style={{ left: at(r.start), width: `max(4px, calc(${at(r.end)} - ${at(r.start)}))` }}
            />
          ))}
          {analysis.bulkInserts.map((b) => (
            <button
              key={`b${b.index}`}
              type="button"
              title={`${b.chars} characters at ${clock(b.at)}`}
              onClick={() => {
                setPlaying(false);
                seek(b.index + 1);
              }}
              className="pointer-events-auto absolute -top-0.5 size-3 -translate-x-1/2 rounded-full bg-danger ring-2 ring-surface"
              style={{ left: at(b.at) }}
            />
          ))}
        </div>
      </div>

      <CodeEditor value={text} language={language} readOnly minLines={6} label="Answer at this point" />

      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {[
          ["Typed one key at a time", `${analysis.typedChars} of ${analysis.finalLength} characters`],
          ["Largest single change", `${analysis.largestInsert?.chars ?? 0} characters`],
          ["Active time", clock(analysis.activeMs)],
          ["Breaks over 2 min", analysis.idleGaps],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-md bg-surface-muted px-2.5 py-1.5">
            <dt className="text-muted">{k}</dt>
            <dd className="font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
