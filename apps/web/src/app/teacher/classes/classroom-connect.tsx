import { ButtonLink } from "@/components/ui";
import { getClassroomStatus } from "@/lib/data/classroom";
import { connectClassroomAction } from "./classroom-actions";

const buttonClass =
  "inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60";

// Connect Google Classroom once; after that, import courses as classes.
export async function ClassroomConnect() {
  const { configured, connected } = await getClassroomStatus();
  if (connected) {
    return (
      <ButtonLink variant="secondary" href="/teacher/classes/import">
        Import from Google Classroom
      </ButtonLink>
    );
  }
  if (!configured) {
    return (
      <button type="button" disabled className={buttonClass} title="Google sign-in isn't set up on this server yet.">
        Connect Google Classroom
      </button>
    );
  }
  return (
    <form action={connectClassroomAction}>
      <button type="submit" className={buttonClass}>
        Connect Google Classroom
      </button>
    </form>
  );
}
