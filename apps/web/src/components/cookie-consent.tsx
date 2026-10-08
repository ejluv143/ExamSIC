"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Cookie, Lock, X } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui";
import {
  categoryInfo,
  consentCookie,
  consentVersion,
  optionalCategories,
  parseConsent,
  type Consent,
  type OptionalCategory,
} from "@/lib/consent";

const changed = "examora:consent";
const openSettings = "examora:cookie-settings";

function readCookie() {
  const entry = document.cookie.split("; ").find((c) => c.startsWith(`${consentCookie}=`));
  return entry?.slice(consentCookie.length + 1) ?? "";
}

function subscribe(onChange: () => void) {
  window.addEventListener(changed, onChange);
  return () => window.removeEventListener(changed, onChange);
}

// The visitor's choice: null until they've made one, and "unknown" while rendering on the server.
export function useConsent(): Consent | null | "unknown" {
  const raw = useSyncExternalStore(subscribe, readCookie, () => null);
  return raw === null ? "unknown" : parseConsent(raw);
}

function save(choice: Record<OptionalCategory, boolean>) {
  const value: Consent = { version: consentVersion, given: new Date().toISOString(), ...choice };
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${consentCookie}=${encodeURIComponent(JSON.stringify(value))}; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(changed));
}

const all = (on: boolean) => Object.fromEntries(optionalCategories.map((c) => [c, on])) as Record<OptionalCategory, boolean>;

// Opens the settings again, e.g. from "Cookie settings" in the footer.
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(openSettings))} className={className}>
      Cookie settings
    </button>
  );
}

// A card in the corner until the visitor chooses, and a settings window with a switch for each kind of cookie.
export function CookieConsent() {
  const consent = useConsent();
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(() => all(false));

  const showSettings = () => {
    setDraft(consent && consent !== "unknown" ? { preferences: consent.preferences, analytics: consent.analytics } : all(false));
    dialog.current?.showModal();
  };

  useEffect(() => {
    const open = () => showSettings();
    window.addEventListener(openSettings, open);
    return () => window.removeEventListener(openSettings, open);
  });

  const choose = (choice: Record<OptionalCategory, boolean>) => {
    save(choice);
    dialog.current?.close();
  };

  return (
    <>
      {consent === null && (
        <div
          role="region"
          aria-label="Cookies"
          className="fixed inset-x-3 bottom-3 z-[90] sm:right-auto sm:bottom-5 sm:left-5 sm:max-w-md motion-safe:animate-[fade-in_0.4s_ease-out] print:hidden"
        >
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 text-foreground shadow-[0_20px_60px_-15px_rgba(0,0,0,0.45)]">
            <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.18),transparent)]" />
            <div className="relative flex gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#6366f1] to-[#4edea3] text-white shadow-lg shadow-[#6366f1]/25">
                <Cookie className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-semibold">Cookies on Examinus</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  We use necessary cookies to keep you signed in. With your OK, we may also use cookies for preferences
                  and analytics.{" "}
                  <Link href="/privacy" className="font-medium text-primary underline-offset-2 hover:underline">
                    Privacy Policy
                  </Link>
                </p>
              </div>
            </div>
            <div className="relative mt-4 grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <button
                type="button"
                onClick={showSettings}
                className="col-span-2 rounded-lg px-2 py-2 text-sm font-medium text-muted underline-offset-2 hover:text-foreground hover:underline sm:col-span-1 sm:mr-auto sm:px-0"
              >
                Choose
              </button>
              <Button variant="secondary" onClick={() => choose(all(false))}>
                Necessary only
              </Button>
              <Button onClick={() => choose(all(true))}>Allow all</Button>
            </div>
          </div>
        </div>
      )}

      <dialog
        ref={dialog}
        aria-labelledby="cookie-settings-title"
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] max-h-[min(88vh,44rem)] overflow-hidden rounded-2xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/50 open:flex open:flex-col motion-safe:open:animate-[fade-in_0.18s_ease-out]"
      >
        <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <h2 id="cookie-settings-title" className="flex items-center gap-2 font-display text-lg font-semibold">
            <Cookie className="size-5 text-primary" aria-hidden /> Cookie settings
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
          <p className="text-sm text-muted">Choose which cookies Examinus may use. You can change this any time from the page footer.</p>
          <Category title={categoryInfo.necessary.title} text={categoryInfo.necessary.text} locked />
          {optionalCategories.map((c) => (
            <Category
              key={c}
              title={categoryInfo[c].title}
              text={categoryInfo[c].text}
              on={draft[c]}
              onToggle={() => setDraft((d) => ({ ...d, [c]: !d[c] }))}
            />
          ))}
        </div>
        <footer className="grid grid-cols-2 gap-2 border-t border-border px-6 py-3 sm:flex sm:justify-end">
          <Button variant="secondary" onClick={() => choose(all(false))}>
            Necessary only
          </Button>
          <Button variant="secondary" onClick={() => choose(draft)}>
            Save choices
          </Button>
          <Button className="col-span-2" onClick={() => choose(all(true))}>
            Allow all
          </Button>
        </footer>
      </dialog>
    </>
  );
}

function Category({
  title,
  text,
  locked,
  on,
  onToggle,
}: {
  title: string;
  text: string;
  locked?: boolean;
  on?: boolean;
  onToggle?: () => void;
}) {
  const checked = locked || on;
  return (
    <div className="flex items-start gap-4 rounded-xl border border-border p-4">
      <div className="flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          {title}
          {locked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted">
              <Lock className="size-3" aria-hidden /> Always on
            </span>
          )}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{text}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={locked}
        onClick={onToggle}
        className={clsx(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60",
          checked ? "bg-primary" : "bg-border",
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}
