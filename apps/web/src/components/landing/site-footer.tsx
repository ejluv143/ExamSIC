import Link from "next/link";
import { LogoMark } from "@/components/logo";

const columns: { title: string; links: [string, string][] }[] = [
  {
    title: "Product",
    links: [
      ["/#features", "Features"],
      ["/#analytics", "Analytics"],
      ["/#how", "How it works"],
      ["/#pricing", "Pricing"],
    ],
  },
  {
    title: "Get started",
    links: [
      ["/register?role=teacher", "Sign up as a teacher"],
      ["/login", "Sign in"],
      ["/join", "Enter a room"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["/terms", "Terms"],
      ["/privacy", "Privacy"],
    ],
  },
];

// The foot of the landing and legal pages: what Examinus is, and links by topic.
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold text-foreground">
            <LogoMark className="size-8" />
            Examinus
          </Link>
          <p className="mt-3 max-w-xs text-sm text-muted">Quizzes, exams and class records for college, graded for you.</p>
        </div>
        {columns.map(({ title, links }) => (
          <nav key={title} aria-label={title}>
            <p className="text-sm font-semibold">{title}</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="hover:text-foreground">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted lg:px-8">© Examinus</p>
      </div>
    </footer>
  );
}
