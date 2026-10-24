import type { Metadata } from "next";
import { Geist_Mono, Inter, Poppins } from "next/font/google";
import { Suspense } from "react";
import { CookieConsent } from "@/components/cookie-consent";
import { RouteProgress } from "@/components/route-progress";
import { StaleBuildReload } from "@/components/stale-build-reload";
import { themeBootScript } from "@/lib/theme";
import "katex/dist/katex.min.css";
import "./globals.css";

// Inter for text and the interface, Poppins for headings, Geist Mono for code. Only Inter is preloaded: it is on every
// page at once. Each Poppins weight and Geist Mono is its own file that many pages never use (the 800 weight only on
// the landing page), and a preloaded file that goes unused within seconds makes browsers warn; they load on first use
// instead, showing the fallback font for a moment (font-display: swap).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Examinus", template: "%s · Examinus" },
  description: "Quizzes and exams for colleges and universities.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The boot script sets data-theme, data-accent and data-sidebar before React hydrates.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${poppins.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        {children}
        <CookieConsent />
        <StaleBuildReload />
      </body>
    </html>
  );
}
