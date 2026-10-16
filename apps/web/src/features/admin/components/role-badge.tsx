import { Badge } from "@/components/ui";

const tones: Record<string, "warning" | "primary" | "info" | "neutral"> = {
  admin: "warning",
  owner: "warning",
  teacher: "primary",
  student: "info",
};
const labels: Record<string, string> = {
  admin: "Admin",
  owner: "Owner",
  teacher: "Teacher",
  student: "Student",
  user: "User",
  guest: "Guest",
};

// A platform role (admin, user, guest) or a role in an organization; an organization's own roles are neutral.
export function RoleBadge({ role }: { role: string }) {
  return <Badge tone={tones[role] ?? "neutral"}>{labels[role] ?? role}</Badge>;
}
