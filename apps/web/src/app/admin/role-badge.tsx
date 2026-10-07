import { Badge } from "@/components/ui";
import type { Role } from "@examora/contract";

const tones = { admin: "warning", teacher: "primary", student: "info" } as const;
const labels: Record<Role, string> = { admin: "Admin", teacher: "Teacher", student: "Student" };

export function RoleBadge({ role }: { role: Role }) {
  return <Badge tone={tones[role]}>{labels[role]}</Badge>;
}
