import { Badge } from "@/components/ui";
import type { Role } from "@examinus/domain/roles";

const tones = { admin: "warning", teacher: "primary", student: "info", guest: "neutral" } as const;
const labels: Record<Role, string> = { admin: "Admin", teacher: "Teacher", student: "Student", guest: "Guest" };

export function RoleBadge({ role }: { role: Role }) {
  return <Badge tone={tones[role]}>{labels[role]}</Badge>;
}
