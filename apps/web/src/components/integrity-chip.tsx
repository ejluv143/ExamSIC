import {
  AppWindow,
  Camera,
  ClipboardPaste,
  Clock,
  Copy,
  Keyboard,
  Layers,
  Minimize2,
  MonitorX,
  MousePointer2,
  MousePointerClick,
  Move,
  Printer,
  Scaling,
  Send,
  TextCursorInput,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { integrityEventLabel } from "@/lib/integrity";
import type { IntegrityEventType } from "@examora/contract";

type Tone = "neutral" | "warning" | "danger" | "info";

// Short name, icon and color per alert. Red: left the exam. Amber: tried to copy or print. Others: worth a look.
export const alertStyle: Record<IntegrityEventType, { label: string; icon: LucideIcon; tone: Tone }> = {
  left_page: { label: "Tab switch", icon: AppWindow, tone: "danger" },
  switched_app: { label: "Switched app", icon: Layers, tone: "danger" },
  alt_tab: { label: "Alt+Tab", icon: Keyboard, tone: "danger" },
  exit_fullscreen: { label: "Left full screen", icon: Minimize2, tone: "danger" },
  second_screen: { label: "Second screen", icon: MonitorX, tone: "danger" },
  auto_submitted: { label: "Auto-submitted", icon: Send, tone: "danger" },
  copy: { label: "Copy", icon: Copy, tone: "warning" },
  paste: { label: "Paste", icon: ClipboardPaste, tone: "warning" },
  drop: { label: "Drag & drop", icon: Move, tone: "warning" },
  bulk_input: { label: "Bulk text", icon: TextCursorInput, tone: "warning" },
  print: { label: "Print", icon: Printer, tone: "warning" },
  screenshot: { label: "Screenshot", icon: Camera, tone: "warning" },
  late_submit: { label: "Late submit", icon: Clock, tone: "warning" },
  window_resize: { label: "Window resize", icon: Scaling, tone: "info" },
  mouse_left: { label: "Mouse left", icon: MousePointer2, tone: "neutral" },
  right_click: { label: "Right-click", icon: MousePointerClick, tone: "neutral" },
};

export function AlertChip({ type, count }: { type: IntegrityEventType; count?: number }) {
  const { label, icon: Icon, tone } = alertStyle[type];
  return (
    <span title={integrityEventLabel[type]}>
      <Badge tone={tone}>
        <Icon className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
        {label}
        {count !== undefined && count > 1 && <span className="ml-1 opacity-70">×{count}</span>}
      </Badge>
    </span>
  );
}
