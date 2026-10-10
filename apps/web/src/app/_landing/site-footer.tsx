import Link from "next/link";
import { LogoMark } from "@/components/logo";

// The foot of the landing and legal pages.
export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:flex-row lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-semibold text-foreground">
          <LogoMark className="size-6" />
          Examinus
        </Link>
        <nav aria-label="Legal" className="flex gap-5">
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </nav>
        <p>© Examinus</p>
      </div>
    </footer>
  );
}
