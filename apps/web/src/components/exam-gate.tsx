"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Hourglass, Loader2, Monitor, ShieldCheck, XCircle } from "lucide-react";
import clsx from "clsx";
import { examRules, isPhoneOrTablet, type Session } from "@examora/contract";
import { checkExamDevice, pingExamApi } from "@/app/student/actions";
import { hasSecondScreen } from "@/components/exam-integrity";
import { Button, Card } from "@/components/ui";

// Slower than this and the exam would be unreliable.
const slowMs = 3000;
const pollMs = 5000;

type Status = "checking" | "pass" | "warn" | "fail";
type Check = { key: string; label: string; status: Status; message: string };

type ClientHints = { userAgentData?: { mobile?: boolean; platform?: string } };

async function deviceChecks(computersOnly: boolean, report: (check: Check) => void) {
  const fullscreen = document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === "function";
  report({
    key: "fullscreen",
    label: "Full screen",
    status: fullscreen ? "pass" : "fail",
    message: fullscreen
      ? "Your browser can show the exam in full screen."
      : "Your browser can't use full screen. Use a recent Chrome, Edge or Firefox on a computer.",
  });

  const canTell = "isExtended" in window.screen;
  const extended = hasSecondScreen();
  report({
    key: "screen",
    label: "One screen",
    status: !canTell ? "warn" : extended ? "fail" : "pass",
    message: !canTell
      ? "Could not check how many screens you use. One screen is required; a second one is reported to your teacher."
      : extended
        ? "A second screen is connected. Disconnect it, or set your display to show on one screen only, then check again."
        : "Only one screen is connected.",
  });

  if (computersOnly) {
    const hints = (navigator as Navigator & ClientHints).userAgentData;
    const phone = isPhoneOrTablet({
      userAgent: navigator.userAgent,
      mobileHint: hints?.mobile === undefined ? undefined : hints.mobile ? "?1" : "?0",
      platform: hints?.platform,
      touchPoints: navigator.maxTouchPoints,
    });
    report({
      key: "computer",
      label: "Computer",
      status: phone ? "fail" : "pass",
      message: phone ? "This exam is for computers only. Phones and tablets can't take it." : "This is a computer.",
    });
  }

  const began = performance.now();
  let connection: Check;
  try {
    await pingExamApi();
    const ms = Math.round(performance.now() - began);
    connection =
      ms > slowMs
        ? { key: "connection", label: "Connection", status: "fail", message: `Your connection is too slow (${ms} ms). Move closer to the router or use a wired connection.` }
        : { key: "connection", label: "Connection", status: "pass", message: `Connected to the exam server (${ms} ms).` };
  } catch {
    connection = { key: "connection", label: "Connection", status: "fail", message: "Couldn't reach the exam server. Check your internet connection." };
  }
  report(connection);
}

const statusIcon: Record<Status, React.ReactNode> = {
  checking: <Loader2 className="size-5 animate-spin text-muted" aria-hidden />,
  pass: <CheckCircle2 className="size-5 text-success" aria-hidden />,
  warn: <AlertTriangle className="size-5 text-warning" aria-hidden />,
  fail: <XCircle className="size-5 text-danger" aria-hidden />,
};

const stepNames = ["Check your device", "Confirm who you are", "Honor pledge", "Rules"] as const;

// What an exam asks of the student before the usual start page: a device check, who they are, the honor pledge
// and the rules. `onDone` is called once all of it is accepted; the pledge is then sent with the start.
export function ExamGate({
  exam,
  student,
  onDone,
}: {
  exam: NonNullable<Session["exam"]>;
  student: { name: string; number: string };
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(true);
  // Bumped by "Check again" to run the device check once more.
  const [round, setRound] = useState(0);
  const [itsMe, setItsMe] = useState(false);
  const [pledge, setPledge] = useState(false);
  const [rules, setRules] = useState(false);

  useEffect(() => {
    // Browser APIs and a server round trip; the results arrive through callbacks.
    let current = true;
    deviceChecks(exam.computersOnly, (check) => {
      if (current) setChecks((all) => [...all.filter((c) => c.key !== check.key), check]);
    }).finally(() => {
      if (current) setRunning(false);
    });
    return () => {
      current = false;
    };
  }, [exam.computersOnly, round]);
  const run = () => {
    setRunning(true);
    setChecks([]);
    setRound((n) => n + 1);
  };

  const passed = !running && checks.length > 0 && checks.every((c) => c.status !== "fail");
  const ready = [passed, itsMe, pledge, rules][step]!;
  const last = step === stepNames.length - 1;

  return (
    <Card className="mx-auto max-w-2xl overflow-hidden">
      <div className="border-b border-border bg-primary-soft px-6 py-5">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
          <ShieldCheck className="size-4" aria-hidden /> Exam · step {step + 1} of {stepNames.length}
        </p>
        <h1 className="mt-1 text-xl font-semibold">{stepNames[step]}</h1>
      </div>
      <div className="space-y-4 p-6">
        {step === 0 && (
          <>
            <ul className="space-y-3">
              {checks.map((c) => (
                <li key={c.key} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5">{statusIcon[c.status]}</span>
                  <span>
                    <span className="font-medium">{c.label}</span>
                    <span className={clsx("block", c.status === "fail" ? "text-danger" : "text-muted")}>{c.message}</span>
                  </span>
                </li>
              ))}
              {running && (
                <li className="flex items-center gap-3 text-sm text-muted">
                  {statusIcon.checking} Checking…
                </li>
              )}
            </ul>
            {!running && checks.some((c) => c.status === "fail") && (
              <Button variant="secondary" onClick={run}>
                Check again
              </Button>
            )}
          </>
        )}
        {step === 1 && (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 rounded-lg bg-surface-muted p-4 text-sm">
              <dt className="text-muted">Name</dt>
              <dd className="font-medium">{student.name}</dd>
              <dt className="text-muted">Student number</dt>
              <dd className="font-medium">{student.number}</dd>
            </dl>
            <Confirm checked={itsMe} onChange={setItsMe}>
              This is me. If these details are not yours, sign out and sign in with your own account.
            </Confirm>
          </>
        )}
        {step === 2 && (
          <>
            <blockquote className="whitespace-pre-wrap rounded-lg border-l-4 border-primary bg-surface-muted p-4 text-sm">
              {exam.honorPledge}
            </blockquote>
            <Confirm checked={pledge} onChange={setPledge}>
              I accept the honor pledge.
            </Confirm>
          </>
        )}
        {step === 3 && (
          <>
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {examRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
            <Confirm checked={rules} onChange={setRules}>
              I read and understand the rules.
            </Confirm>
          </>
        )}
        <div className="flex justify-between gap-2 pt-2">
          <Button variant="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>
            Back
          </Button>
          <Button disabled={!ready} onClick={() => (last ? onDone() : setStep(step + 1))}>
            {last ? "Continue to start" : "Next"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Confirm({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-sm font-medium">
      <input type="checkbox" className="mt-0.5 size-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

// The exam is for computers and this is a phone or tablet.
export function UseComputer({ message }: { message: string }) {
  return (
    <Card role="alert" className="mx-auto max-w-lg p-8 text-center">
      <Monitor className="mx-auto size-8 text-danger" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold">Use a computer</h1>
      <p className="mt-1 text-sm text-muted">{message} Open this page on a laptop or desktop computer to take the exam.</p>
    </Card>
  );
}

// The teacher must approve this device (another computer, or away too long) before the exam goes on. Asks
// every few seconds and continues by itself: the page re-reads the paper when it is allowed.
export function DeviceApproval({ sessionId, onApproved }: { sessionId: string; onApproved?: () => void }) {
  const router = useRouter();
  const [problem, setProblem] = useState(false);
  useEffect(() => {
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const state = await checkExamDevice(sessionId);
        if (stopped) return;
        setProblem(false);
        if (state !== "waiting") {
          onApproved?.();
          router.refresh();
        }
      } catch {
        if (!stopped) setProblem(true);
      }
    }, pollMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [sessionId, router, onApproved]);
  return (
    <Card role="status" className="mx-auto max-w-lg p-8 text-center">
      <Hourglass className="mx-auto size-8 text-info" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold">Waiting for your teacher to approve this device</h1>
      <p className="mt-1 text-sm text-muted">
        Keep this page open. It continues by itself when your teacher allows it. The timer keeps running.
      </p>
      {problem && <p className="mt-3 text-sm text-danger">Couldn&apos;t reach the server. Trying again…</p>}
    </Card>
  );
}
