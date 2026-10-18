import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { AuthShell, ShowcaseCard } from "@/features/auth/components/auth-shell";
import { ConsentForm } from "@/features/auth/components/consent-form";

export const metadata: Metadata = { title: "Allow access" };

// Where the API's OAuth server (Better Auth's mcp plugin) asks a signed-in teacher whether an MCP client (Gemini,
// Claude) may act as them. The query is the client's authorization request, signed by the API.
export default async function ConsentPage(props: PageProps<"/oauth/consent">) {
  const { client_id, scope } = await props.searchParams;
  return (
    <AuthShell
      eyebrow="Connect an AI assistant"
      headline="Let your assistant work"
      highlight="as you."
      lead="An AI assistant connected to Examinus can create quizzes and questions and read your classes, sessions and results, with your permissions."
      showcase={<ConsentShowcase />}
    >
      <ConsentForm clientId={typeof client_id === "string" ? client_id : ""} scope={typeof scope === "string" ? scope : ""} />
    </AuthShell>
  );
}

function ConsentShowcase() {
  return (
    <ShowcaseCard className="w-72">
      <p className="flex items-center gap-1.5 font-semibold text-success">
        <ShieldCheck className="size-3.5" /> Your permissions only
      </p>
      <p className="mt-2 text-muted">The assistant sees and changes only what you can in the web app.</p>
    </ShowcaseCard>
  );
}
