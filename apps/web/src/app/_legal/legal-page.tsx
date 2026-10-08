import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { Result } from "effect";
import { homeFor } from "@examora/contract";
import { callApi, forwardedHeaders } from "@/lib/api/client";
import { SiteFooter } from "../_landing/site-footer";
import { SiteHeader } from "../_landing/site-header";
import { c, Eyebrow } from "../_landing/theme";

// /terms and /privacy: one document in a readable column, with the site's header and footer.
export async function LegalPage({ title, other, children }: { title: string; other: { href: string; label: string }; children: ReactNode }) {
  const session = await callApi((api) => api["auth.session"](), forwardedHeaders(await headers()));
  const home = Result.isSuccess(session) ? homeFor(session.success.user.role) : null;
  const cta = home ? { href: home, label: "Open Examora" } : { href: "/login", label: "Sign in" };

  return (
    <div id="top" className={`${c.bg} ${c.text} min-h-full antialiased`}>
      <SiteHeader cta={cta} signedIn={home !== null} />
      <main className="px-4 pt-14 pb-24 lg:px-10">
        <article className="mx-auto max-w-3xl">
          <Eyebrow tone={c.green}>Legal</Eyebrow>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl">{title}</h1>
          <div className={`mt-10 rounded-3xl border ${c.line} ${c.low} p-6 sm:p-10 [&_h2]:text-white`}>{children}</div>
          <p className={`mt-6 text-sm ${c.muted}`}>
            See also the{" "}
            <Link href={other.href} className="font-semibold text-[#c0c1ff] hover:underline">
              {other.label}
            </Link>
            .
          </p>
        </article>
      </main>
      <SiteFooter cta={cta} signedIn={home !== null} />
    </div>
  );
}
