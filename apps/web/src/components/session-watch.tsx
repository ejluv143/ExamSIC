"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { sessionActive, signOutIdle } from "@/app/login/actions";
import { Button } from "@/components/ui";

// Signed out after this long with no mouse, keyboard, touch or scroll, with a warning a minute before.
const idleMs = 30 * 60_000;
const warnMs = 60_000;
// How often an open page checks that its session is still valid (also when the tab comes back into view).
const checkMs = 2 * 60_000;

// Activity in any tab keeps every tab signed in, so it's shared through localStorage when that works.
const lastActiveKey = "examora:last-active";

// Taking an exam can mean reading a long question without touching anything; the exam has its own timer.
const takingExam = (path: string) => /^\/student\/assessments\/[^/]+$/.test(path);

function readShared(): number {
  try {
    return Number(localStorage.getItem(lastActiveKey)) || 0;
  } catch {
    return 0;
  }
}

function writeShared(time: number) {
  try {
    localStorage.setItem(lastActiveKey, String(time));
  } catch {
    // Private windows can refuse storage; this tab's own activity still counts.
  }
}

// Signs out after inactivity, and sends the page to sign-in when the session has ended elsewhere.
export function SessionWatch() {
  const pathname = usePathname();
  const router = useRouter();
  const lastActive = useRef(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const signingOut = useRef(false);

  const touch = () => {
    const now = Date.now();
    // Writing on every mouse move would be wasteful; a few seconds of precision is plenty.
    if (now - lastActive.current < 5_000) return;
    lastActive.current = now;
    writeShared(now);
  };

  // Idle sign-out.
  useEffect(() => {
    lastActive.current = Date.now();
    writeShared(lastActive.current);
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });

    const tick = () => {
      if (signingOut.current) return;
      if (takingExam(window.location.pathname)) return setSecondsLeft(null);
      const idle = Date.now() - Math.max(lastActive.current, readShared());
      if (idle >= idleMs) {
        signingOut.current = true;
        void signOutIdle(window.location.pathname + window.location.search);
      } else if (idle >= idleMs - warnMs) {
        setSecondsLeft(Math.ceil((idleMs - idle) / 1000));
      } else {
        setSecondsLeft(null);
      }
    };
    const timer = window.setInterval(tick, 1_000);
    return () => {
      window.clearInterval(timer);
      for (const e of events) window.removeEventListener(e, touch);
    };
  }, []);

  // A session that ended elsewhere: expired, signed out in another tab, or suspended by an admin.
  useEffect(() => {
    let checking = false;
    const check = async () => {
      if (checking || signingOut.current || document.visibilityState !== "visible") return;
      checking = true;
      try {
        if (!(await sessionActive())) {
          signingOut.current = true;
          const next = encodeURIComponent(window.location.pathname + window.location.search);
          router.replace(`/login?signedOut=expired&next=${next}`);
        }
      } catch {
        // Offline or the server is restarting; try again on the next check.
      } finally {
        checking = false;
      }
    };
    const timer = window.setInterval(check, checkMs);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [router]);

  // A new page counts as activity.
  useEffect(() => {
    lastActive.current = Date.now();
    writeShared(lastActive.current);
  }, [pathname]);

  if (secondsLeft === null) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 print:hidden"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-title"
      aria-describedby="idle-detail"
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
            <Clock className="size-5" aria-hidden />
          </span>
          <h2 id="idle-title" className="text-lg font-semibold">
            Still there?
          </h2>
        </div>
        <p id="idle-detail" className="mt-3 text-sm text-muted">
          You&apos;ll be signed out in {secondsLeft} second{secondsLeft === 1 ? "" : "s"} because you haven&apos;t been
          active for a while.
        </p>
        <Button
          className="mt-5 w-full"
          autoFocus
          onClick={() => {
            lastActive.current = Date.now();
            writeShared(lastActive.current);
            setSecondsLeft(null);
          }}
        >
          Stay signed in
        </Button>
      </div>
    </div>
  );
}
