import Link from "next/link";
import { ArrowRight, ArrowUp } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { c } from "./theme";

export function SiteFooter({ cta, signedIn }: { cta: { href: string; label: string }; signedIn: boolean }) {
  return (
    <footer className={`relative isolate overflow-hidden border-t ${c.line} ${c.lowest} px-4 pt-16 lg:px-10`}>
      <div className="absolute top-0 left-1/2 -z-10 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-[#c0c1ff]/60 to-transparent" />
      <div className="absolute -top-40 left-1/2 -z-10 h-72 w-[700px] max-w-full -translate-x-1/2 rounded-full bg-[#c0c1ff]/[0.07] blur-[100px]" />
      <div className="mx-auto grid max-w-7xl gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-3">
            <LogoMark className="size-12" />
            <span className="font-display text-2xl font-bold tracking-tight">Examora</span>
          </Link>
          <p className={`mt-4 max-w-sm text-sm leading-relaxed ${c.muted}`}>
            Quizzes, exams and class records for every subject: graded, kept honest and recorded for you.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href={cta.href}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#c0c1ff] px-4 py-2 text-[13px] font-bold text-[#1000a9] hover:bg-[#e1e0ff]"
            >
              {cta.label} <ArrowRight className="size-3.5" aria-hidden />
            </Link>
            {!signedIn && (
              <Link
                href="/register?role=teacher"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-[13px] font-semibold hover:bg-white/[0.06]"
              >
                Sign up free
              </Link>
            )}
          </div>
        </div>
        {[
          [
            "Product",
            [
              ["/features", "Features"],
              ["/how-it-works", "How it works"],
              ["/anti-cheating", "Anti-cheating"],
              ["/class-record", "Class record"],
              ["/for-students", "For students"],
              ["/pricing", "Pricing"],
            ],
          ],
          [
            "Account",
            [
              [cta.href, cta.label],
              ...(signedIn
                ? []
                : [
                    ["/register?role=teacher", "Sign up as a teacher"],
                    ["/register?role=student", "Join a class as a student"],
                  ]),
            ],
          ],
        ].map(([title, links]) => (
          <nav key={String(title)} aria-label={String(title)}>
            <p className={`text-[11px] font-bold tracking-[0.16em] uppercase ${c.primary}`}>{String(title)}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {(links as string[][]).map(([href, label]) => (
                <li key={label}>
                  <Link href={href} className={`group inline-flex items-center ${c.muted} hover:text-white`}>
                    <span className="h-px w-0 bg-[#4edea3] transition-all group-hover:mr-1.5 group-hover:w-3" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {/* The name, big and outlined, fading into the bottom edge. */}
      <p
        aria-hidden
        className="pointer-events-none mt-16 bg-gradient-to-b from-[#c0c1ff]/20 via-[#4edea3]/[0.06] to-transparent bg-clip-text text-center font-display text-[18vw] leading-[0.8] font-extrabold tracking-tighter text-transparent select-none [-webkit-text-stroke:1px_rgba(192,193,255,0.35)] [mask-image:linear-gradient(to_bottom,black_35%,transparent_100%)] lg:text-[230px]"
      >
        EXAMORA
      </p>

      <div className={`relative mx-auto -mt-6 flex max-w-7xl flex-col items-center justify-between gap-3 border-t ${c.line} py-6 text-xs sm:flex-row ${c.muted}`}>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>© {new Date().getFullYear()} Examora</span>
          <Link href="/terms" className="hover:text-white">
            Terms of Service
          </Link>
          <Link href="/privacy" className="hover:text-white">
            Privacy Policy
          </Link>
        </span>
        <a href="#top" className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 hover:border-white/25 hover:text-white">
          Back to top <ArrowUp className="size-3.5" aria-hidden />
        </a>
      </div>
    </footer>
  );
}
