"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WifiOff } from "lucide-react";
import type { Avatar } from "@examinus/domain/avatar";
import type { IntegritySettings, Session } from "@examinus/domain/quiz";
import { modeLabel } from "@examinus/copy/modes";
import { LobbyAvatar, LobbyStage, PlayerFrame } from "@/components/lobby";
import { followLobby, type LiveStatus } from "@/features/live/client";
import type { AttemptHrefs } from "../hrefs";

// While the lobby is open: students gather here until the teacher presses Start. The same screen as a game's lobby,
// with the session's anti-cheating rules on their tab. `hrefs`: this player's pages.
export function SessionLobby({
  sessionId,
  title,
  mode,
  studentName,
  avatar: initialAvatar,
  integrity: initialIntegrity,
  hrefs,
}: {
  sessionId: string;
  title: string;
  mode: Session["mode"];
  studentName: string;
  avatar: Avatar;
  integrity: IntegritySettings;
  hrefs: AttemptHrefs;
}) {
  const router = useRouter();
  const [connection, setConnection] = useState<LiveStatus>("connecting");
  const [avatar, setAvatar] = useState(initialAvatar);
  const [integrity, setIntegrity] = useState(initialIntegrity);

  // The teacher can still edit the session while the lobby is open: the rules on the tab follow.
  useEffect(
    () =>
      followLobby(sessionId, {
        onStatus: setConnection,
        onEvent: (session) => {
          setIntegrity(session.integrity);
          if (session.status === "running") router.refresh();
          else if (session.status === "ended") router.push(hrefs.result);
        },
      }),
    [sessionId, router, hrefs.result],
  );

  // Without a working connection, ask the server every few seconds so nobody is stuck here.
  const offline = connection === "reconnecting" || connection === "closed";
  useEffect(() => {
    if (!offline) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [offline, router]);

  const header = (
    <div className="mb-4 flex items-center gap-3 text-sm">
      <span className="font-semibold">{studentName}</span>
    </div>
  );

  return (
    <PlayerFrame
      homeHref={hrefs.list ?? "/join"}
      leaveLabel={hrefs.list ? "Exit" : "Leave"}
      status={connection === "connecting" ? "Connecting…" : offline ? "Reconnecting…" : null}
      data-testid="player"
    >
      <LobbyStage
        header={header}
        avatar={<LobbyAvatar avatar={avatar} onSaved={setAvatar} />}
        title={title}
        subtitle={modeLabel(mode)}
        integrity={integrity}
        kind={modeLabel(mode).toLowerCase()}
      >
        <p className="animate-pop-in text-2xl font-medium text-primary">You&apos;re in!</p>
        <p role="status" className="inline-flex items-center gap-2 text-base text-muted sm:text-lg">
          <span className="flex gap-1" aria-hidden>
            {[0, 150, 300].map((delay) => (
              <span key={delay} className="size-1.5 animate-pulse rounded-full bg-muted" style={{ animationDelay: `${delay}ms` }} />
            ))}
          </span>
          Waiting for your teacher to start…
        </p>
        {offline && (
          <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
            <WifiOff className="size-3.5" aria-hidden /> Reconnecting to your teacher…
          </p>
        )}
      </LobbyStage>
    </PlayerFrame>
  );
}
