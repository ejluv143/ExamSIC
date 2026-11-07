"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Pencil, ShieldCheck } from "lucide-react";
import type { Avatar } from "@examinus/domain/avatar";
import { integrityRules } from "@examinus/domain/integrity";
import type { IntegritySettings } from "@examinus/domain/quiz";
import { Dialog } from "@/components/dialog";
import { FullscreenToggle } from "@/components/fullscreen-toggle";
import { ThemeMenu } from "@/components/theme-menu";
import { Button, Card } from "@/components/ui";
import { AvatarEditor, AvatarImage } from "@/features/auth/components/avatar";

// The lobby every session mode (quiz, exam, mastery, game) shows its players before the teacher starts: the game's
// layout, with a tab for the anti-cheating rules of the session.

// The window-filling frame around a player's screens: a top bar with the way out, the connection, Appearance and
// full screen, then the screen below it.
export function PlayerFrame({
  homeHref,
  leaveLabel,
  status,
  children,
  ...rest
}: {
  homeHref: string;
  leaveLabel: string;
  // Shown in amber when the live connection isn't up.
  status?: string | null;
  children: React.ReactNode;
  "data-testid"?: string;
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
}) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-auto bg-background text-foreground" {...rest}>
      <div className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
        <Link href={homeHref} className="text-muted hover:underline">
          {leaveLabel}
        </Link>
        {status && <span className="text-amber-600 dark:text-amber-400">{status}</span>}
        <div className="flex items-center gap-2">
          <ThemeMenu placement="header" />
          <FullscreenToggle />
        </div>
      </div>
      <div className="flex flex-1 flex-col px-4 pb-6">{children}</div>
    </div>
  );
}

type LobbyTab = "lobby" | "integrity";

// The lobby screen: an optional header, then one card with the avatar, the title and two tabs. "Lobby" holds
// `children` (what the player waits for, or can do meanwhile); "Anti-cheating" lists the session's rules.
export function LobbyStage({
  header,
  avatar,
  title,
  subtitle,
  integrity,
  kind,
  children,
}: {
  header?: React.ReactNode;
  avatar: React.ReactNode;
  title: string;
  subtitle?: string;
  integrity: IntegritySettings;
  // "exam", "quiz"…, lower case, for the rules' wording.
  kind: string;
  children: React.ReactNode;
}) {
  const [tab, setTab] = useState<LobbyTab>("lobby");
  const tabs: [LobbyTab, string][] = [
    ["lobby", "Lobby"],
    ["integrity", "Anti-cheating"],
  ];
  return (
    <div className="flex w-full flex-1 flex-col">
      {header}
      <Card className="animate-rise flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center sm:p-10" data-testid="lobby">
        {avatar}
        <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        <div role="tablist" aria-label="Lobby" className="inline-flex rounded-lg bg-surface-muted p-0.5 text-sm">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`lobby-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`lobby-panel-${id}`}
              onClick={() => setTab(id)}
              className={clsx("rounded-md px-3 py-1 font-medium", tab === id ? "bg-surface shadow-sm" : "text-muted hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`lobby-panel-${tab}`}
          aria-labelledby={`lobby-tab-${tab}`}
          className="flex w-full flex-1 flex-col items-center justify-center gap-4"
        >
          {tab === "lobby" ? children : <IntegrityRules integrity={integrity} kind={kind} />}
        </div>
      </Card>
    </div>
  );
}

function IntegrityRules({ integrity, kind }: { integrity: IntegritySettings; kind: string }) {
  const rules = integrityRules(integrity, kind);
  return (
    <div className="w-full max-w-xl rounded-lg bg-warning-soft p-4 text-left text-sm text-warning">
      <p className="flex items-center gap-2 font-medium">
        <ShieldCheck className="size-4 shrink-0" aria-hidden /> Anti-cheating
      </p>
      {rules.length === 0 ? (
        <p className="mt-1.5">No anti-cheating rules for this {kind}.</p>
      ) : (
        <ul className="mt-1.5 list-disc space-y-1 pl-6">
          {rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The player's avatar, large, with a button to change it. `onSaved` gets the new one (a game also sees it arrive
// through its live view).
export function LobbyAvatar({ avatar, onSaved }: { avatar: Avatar; onSaved?: (avatar: Avatar) => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex flex-col items-center gap-3">
      <AvatarImage avatar={avatar} size={160} alt="Your avatar" className="animate-bob" />
      <Button variant="secondary" onClick={() => setEditing(true)}>
        <Pencil className="size-4" aria-hidden /> Customize avatar
      </Button>
      <Dialog open={editing} onClose={() => setEditing(false)} title="Your avatar" description="Everyone in the room sees it." size="lg">
        <AvatarEditor
          initial={avatar}
          onSaved={(saved) => {
            setEditing(false);
            onSaved?.(saved);
          }}
          onCancel={() => setEditing(false)}
        />
      </Dialog>
    </div>
  );
}
