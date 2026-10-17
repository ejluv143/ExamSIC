import { headers } from "next/headers";
import { clientOf, isOutdated, releasesUrl } from "@examinus/domain/client";
import { AppShell } from "@/components/app-shell";
import { StudentNav } from "@/components/nav/student-nav";
import { UpdateDesktop } from "@/components/update-desktop";
import { getAuthConfig } from "@/features/organization/data";

export default async function StudentLayout({ children }: LayoutProps<"/student">) {
  // The desktop app announces its version in the user agent; a build older than the API requires sees only the
  // update screen (the API would refuse to open a paper anyway).
  const client = clientOf((await headers()).get("user-agent") ?? undefined);
  let body = children;
  if (client.kind === "desktop") {
    const { desktop } = await getAuthConfig();
    if (isOutdated(client.version, desktop.minVersion))
      body = <UpdateDesktop version={client.version} minVersion={desktop.minVersion} releasesUrl={releasesUrl(desktop.releases)} />;
  }
  return (
    <AppShell home="/student" nav={<StudentNav />}>
      {body}
    </AppShell>
  );
}
