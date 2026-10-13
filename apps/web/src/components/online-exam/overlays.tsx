import { Maximize, MonitorX } from "lucide-react";
import { Button, Card } from "../ui";

// Shown over the exam while a second monitor is connected, when the exam allows one screen only.
export function SecondScreenOverlay({ kind, timerRunning }: { kind: string; timerRunning: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background p-4">
      <Card role="alertdialog" aria-labelledby="screen-title" className="max-w-sm space-y-3 p-6 text-center">
        <MonitorX className="mx-auto size-8 text-danger" aria-hidden />
        <h2 id="screen-title" className="font-semibold">
          Disconnect the second screen
        </h2>
        <p className="text-sm text-muted">
          This {kind} allows one screen only. It was recorded and your teacher will see it. The questions come
          back once the extra monitor is disconnected
          {timerRunning && "; the timer is still running"}.
        </p>
      </Card>
    </div>
  );
}

// Shown over the exam once the student has left full screen. `chancesText` says how often they may still leave.
export function FullscreenOverlay({
  kind,
  timerRunning,
  chancesText,
  onEnter,
}: {
  kind: string;
  timerRunning: boolean;
  chancesText: string;
  onEnter: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-4 backdrop-blur">
      <Card role="alertdialog" aria-labelledby="fullscreen-title" className="max-w-sm space-y-4 p-6 text-center">
        <Maximize className="mx-auto size-8 text-primary" aria-hidden />
        <div>
          <h2 id="fullscreen-title" className="font-semibold">
            Return to full screen
          </h2>
          <p className="mt-1 text-sm text-muted">
            This {kind} is taken in full screen. Your answers are saved
            {timerRunning && ", and the timer is still running"}.{chancesText}
          </p>
        </div>
        <Button className="w-full" onClick={onEnter}>
          <Maximize className="size-4" aria-hidden /> Continue in full screen
        </Button>
      </Card>
    </div>
  );
}
