import type { Metadata } from "next";
import { PrivacyPolicy } from "@/components/legal/documents";
import { LegalPage } from "../_legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What personal information Examora collects, why, and your rights under the Data Privacy Act of 2012.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" other={{ href: "/terms", label: "Terms of Service" }}>
      <PrivacyPolicy />
    </LegalPage>
  );
}
