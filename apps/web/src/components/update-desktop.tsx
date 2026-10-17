import { Download } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";

// Shown instead of the student pages when the desktop app running this page is older than the API allows
// (DESKTOP_MIN_VERSION). The link opens in the system browser: the shell only shows the web app itself.
export function UpdateDesktop({ version, minVersion, releasesUrl }: { version: string; minVersion: string; releasesUrl: string }) {
  return (
    <Card role="alert" className="mx-auto max-w-lg p-8 text-center">
      <Download className="mx-auto size-8 text-danger" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold">Update Examinus Desktop</h1>
      <p className="mt-1 text-sm text-muted">
        You have version {version}. Version {minVersion} or newer is required to take quizzes and exams. Install the
        latest release, then open Examinus Desktop again.
      </p>
      <ButtonLink href={releasesUrl} target="_blank" rel="noreferrer" className="mt-4">
        <Download className="size-4" aria-hidden />
        Download the latest version
      </ButtonLink>
    </Card>
  );
}
