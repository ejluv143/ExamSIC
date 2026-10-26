// How long each question has been on screen, sent with its answers for the too-fast check. The platform decides
// what "on screen" means (an IntersectionObserver in the browser, the visible list of a phone) and calls `show` and
// `hide`; this adds the time up.
export type TimeSpent = {
  // The question came on screen (and the app is visible). Does nothing when it is already counting.
  show(id: string): void;
  // The question left the screen (or the app was hidden): what it has run so far is kept.
  hide(id: string): void;
  // Milliseconds so far for a question, counting the stretch that is still running.
  snapshot(id: string): number;
};

export function createTimeSpent(now: () => number = Date.now): TimeSpent {
  const spent = new Map<string, number>();
  const shownSince = new Map<string, number>();
  return {
    show(id) {
      if (!shownSince.has(id)) shownSince.set(id, now());
    },
    hide(id) {
      const since = shownSince.get(id);
      if (since === undefined) return;
      spent.set(id, (spent.get(id) ?? 0) + now() - since);
      shownSince.delete(id);
    },
    snapshot(id) {
      const since = shownSince.get(id);
      return Math.round((spent.get(id) ?? 0) + (since === undefined ? 0 : now() - since));
    },
  };
}
