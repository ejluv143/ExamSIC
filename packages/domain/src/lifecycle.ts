// Which lifecycle buttons a session offers, from its status and mode. One place, so the sessions list, the session
// page, the live view and the game presenter agree on what a teacher can do now.
import type { ResultsRelease, SessionMode, SessionStatus } from "./quiz.ts";

export type LifecycleControls = {
  // Scheduled: open the lobby so students can gather.
  openLobby: boolean;
  // The lobby is open: start the session.
  start: boolean;
  // `start`, offered straight from the sessions list. Games start from the presenter screen, so not there.
  startFromList: boolean;
  // Running and not paused / paused.
  pause: boolean;
  resume: boolean;
  // Lobby or running: end it now.
  end: boolean;
  // The session is being run: the live view (or presenter) has something to show.
  live: boolean;
  // Results are released by hand, and there is something to release.
  release: boolean;
};

export function lifecycleControls(session: {
  status: SessionStatus;
  mode: SessionMode;
  resultsRelease?: ResultsRelease;
  paused?: boolean;
}): LifecycleControls {
  const { status, mode } = session;
  const running = status === "running";
  const live = status === "lobby" || running;
  return {
    openLobby: status === "scheduled",
    start: status === "lobby",
    startFromList: status === "lobby" && mode !== "game",
    pause: running && !session.paused,
    resume: running && session.paused === true,
    end: live,
    live,
    release: session.resultsRelease === "manual" && status !== "scheduled",
  };
}
