import type { Metadata } from "next";
import { TermsOfService } from "@/components/legal/documents";
import { LegalPage } from "../_legal/legal-page";

export const metadata: Metadata = { title: "Terms of Service", description: "The terms for using Examinus." };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" other={{ href: "/privacy", label: "Privacy Policy" }}>
      <TermsOfService />
    </LegalPage>
  );
}
