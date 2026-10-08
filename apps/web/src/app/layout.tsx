import type { Metadata } from "next";
import { Geist_Mono, Inter, Poppins } from "next/font/google";
import { Suspense } from "react";
import { RouteProgress } from "@/components/route-progress";
import "katex/dist/katex.min.css";
import "./globals.css";

// Inter for text and the interface, Poppins for headings, Geist Mono for code.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Examora", template: "%s · Examora" },
  description: "Quizzes and exams for colleges and universities.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${poppins.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
