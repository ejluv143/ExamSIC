import type { Metadata } from "next";
import { Baloo_2, Geist_Mono, Nunito } from "next/font/google";
import { Suspense } from "react";
import { CookieConsent } from "@/components/cookie-consent";
import { RouteProgress } from "@/components/route-progress";
import { StaleBuildReload } from "@/components/stale-build-reload";
import { themeBootScript } from "@/lib/theme";
import "katex/dist/katex.min.css";
import "./globals.css";

// Nunito for text and the interface, Baloo 2 for headings, Geist Mono for code. Nunito and Baloo 2 are on every page,
// so both are preloaded. Geist Mono loads on first use instead (a preloaded file that goes unused within seconds makes
// browsers warn), showing the fallback font for a moment (font-display: swap).
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
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
      className={`${nunito.variable} ${baloo.variable} ${geistMono.variable} h-full antialiased`}
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
