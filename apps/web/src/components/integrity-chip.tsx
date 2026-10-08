import {
  AppWindow,
  Bug,
  Camera,
  ClipboardPaste,
  Clock,
  Columns2,
  Copy,
  Keyboard,
  Layers,
  Minimize2,
  MonitorSmartphone,
  MonitorX,
  MousePointer2,
  MousePointerClick,
  Move,
  Network,
  Printer,
  Scaling,
  Send,
  Share2,
  Unplug,
  Users,
  Zap,
  TextCursorInput,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { integrityEventLabel } from "@/lib/integrity";
import type { IntegrityEventType } from "@examora/contract";

type Tone = "neutral" | "warning" | "danger" | "info" | "success";

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
  disconnected: { label: "Disconnected", icon: Unplug, tone: "danger" },
  device_changed: { label: "Device changed", icon: MonitorSmartphone, tone: "danger" },
  shared_device: { label: "Shared device", icon: Users, tone: "danger" },
  devtools_open: { label: "Dev tools", icon: Bug, tone: "danger" },
  too_fast: { label: "Too fast", icon: Zap, tone: "warning" },
  split_screen: { label: "Split screen", icon: Columns2, tone: "warning" },
  network_changed: { label: "Network changed", icon: Network, tone: "warning" },
  shared_network: { label: "Shared network", icon: Share2, tone: "info" },
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

const levelStyle: Record<"low" | "medium" | "high", { label: string; tone: Tone }> = {
  low: { label: "Low", tone: "success" },
  medium: { label: "Medium", tone: "warning" },
  high: { label: "High", tone: "danger" },
};

export function IntegrityLevelBadge({ level }: { level: "low" | "medium" | "high" }) {
  const { label, tone } = levelStyle[level];
  return <Badge tone={tone}>{label}</Badge>;
}
