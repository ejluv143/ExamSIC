// How long something took or how much is left. One formatter; the style says where it is shown.
//   words      "1 min 5 s", "45 s", "2 h 3 min"; "—" for nothing. For reports and incident text.
//   compact    "34s", "1m 08s", "1h 05m". For dense report figures.
//   clock      "4:07", to the nearest second. For a time taken, e.g. a solve.
//   countdown  "1:01", rounded up. For time left, so it never reads 0:00 while time remains.
//   elapsed    "4:07", rounded down. For a position in a replay.
export type DurationStyle = "words" | "compact" | "clock" | "countdown" | "elapsed";

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function formatDuration(ms: number | null, style: DurationStyle): string {
  if (ms === null) return "—";
  switch (style) {
    case "clock":
      return clock(Math.round(ms / 1000));
    case "countdown":
      return clock(Math.ceil(ms / 1000));
    case "elapsed":
      return clock(Math.floor(ms / 1000));
    case "words": {
      const total = Math.round(ms / 1000);
      if (total <= 0) return "—";
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const sec = total % 60;
      if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
      if (m > 0) return sec > 0 ? `${m} min ${sec} s` : `${m} min`;
      return `${sec} s`;
    }
    case "compact": {
      const total = Math.max(0, Math.round(ms / 1000));
      if (total < 60) return `${total}s`;
      const minutes = Math.floor(total / 60);
      if (minutes < 60) return `${minutes}m ${String(total % 60).padStart(2, "0")}s`;
      return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
    }
  }
}

// "+12s" / "-8s" against a reference time.
export const formatDelta = (ms: number) => `${ms < 0 ? "-" : "+"}${formatDuration(Math.abs(ms), "compact")}`;
