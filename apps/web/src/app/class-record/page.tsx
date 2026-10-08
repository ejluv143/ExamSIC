import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { Result } from "effect";
import { ArrowRight, BarChart3, CalendarDays, CheckCircle2, ClipboardList, FileSpreadsheet, GraduationCap, Link2, Printer, ToggleRight, type LucideIcon } from "lucide-react";
import { homeFor } from "@examora/contract";
import { callApi, forwardedHeaders } from "@/lib/api/client";
import { attendancePolicy } from "@/lib/attendance";
import { absenceLimit } from "@/lib/grading";
import { RecordCompare, RollCallPhone } from "../_landing/class-record";
import { Reveal } from "../_landing/reveal";
import { SiteFooter } from "../_landing/site-footer";
import { SiteHeader } from "../_landing/site-header";
import { Backdrop, c, Eyebrow } from "../_landing/theme";
import { AttendanceCounter, GradeCalculator } from "./calculators";

export const metadata: Metadata = {
  title: "Class record",
  description:
    "A class record laid out like your school's Excel sheet: weights, RS, the TRANSMU table, midterm and final grades with P, F, FA and DR remarks, attendance on a phone, and printable grade sheets.",
};

const remarks: [string, string, string, string][] = [
  ["P", "Passed", "A grade of 3.00 or better.", "bg-[#4edea3]/15 text-[#4edea3]"],
  ["F", "Failed", "A grade of 3.25 to 5.00.", "bg-[#ffb4ab]/15 text-[#ffb4ab]"],
  ["FA", "Failed, absences", `Failed with more than ${absenceLimit} absences.`, "bg-[#ffb4ab]/15 text-[#ffb4ab]"],
  ["DR", "Dropped", "Dropped by the teacher, after the drop flag.", "bg-white/10 text-[#c7c4d7]"],
];

const exports: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: GraduationCap, title: "Collegiate grade sheet", text: "Printable, straight from the record, ready to sign and submit." },
  { icon: BarChart3, title: "Summary report", text: "The summary report on class academic performance, per teacher." },
  { icon: FileSpreadsheet, title: "Class record in Excel", text: "Download the whole record any time, laid out like your sheet." },
  { icon: CalendarDays, title: "Attendance in Excel", text: "A sheet per month with weekday names, plus a semester summary." },
];

export default async function ClassRecordPage() {
  const session = await callApi((api) => api["auth.session"](), forwardedHeaders(await headers()));
  const home = Result.isSuccess(session) ? homeFor(session.success.user.role) : null;
  const cta = home ? { href: home, label: "Open Examinus" } : { href: "/login", label: "Sign in" };

  return (
    <div id="top" className={`${c.bg} ${c.text} min-h-full antialiased`}>
      <SiteHeader cta={cta} signedIn={home !== null} />

      <main className="overflow-x-clip">
        {/* Hero, with the before/after slider */}
        <section className="relative isolate px-4 pt-14 pb-20 lg:px-10 lg:pt-20">
          <Backdrop
            photo="1427504494785-3a9ca7044f45"
            className="inset-x-0 -top-24 h-[700px]"
            shade="bg-[#0b1326]/70"
            mask="linear-gradient(to bottom, black 0%, black 35%, transparent 100%)"
          />
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <Eyebrow tone={c.green}>Class record</Eyebrow>
              <h1 className="mt-3 font-display text-[36px] leading-tight font-extrabold tracking-tight sm:text-[56px]">
                Your school&apos;s class record,{" "}
                <span className="bg-gradient-to-r from-[#4edea3] via-[#c0c1ff] to-[#d0bcff] bg-clip-text text-transparent">without the spreadsheet</span>
              </h1>
              <p className={`mx-auto mt-5 max-w-2xl text-lg leading-relaxed ${c.muted}`}>
                Same columns, same weights, same transmutation table. Quizzes, exams and attendance fill it in, and the grades compute
                themselves.
              </p>
            </div>
            <div className="mx-auto mt-12 max-w-4xl">
              <RecordCompare />
              <p className={`mt-3 text-center text-xs ${c.muted}`}>Drag the handle: your workbook on the left, Examinus on the right.</p>
            </div>
          </div>
        </section>

        {/* The math */}
        <section className={`border-y ${c.line} ${c.lowest} px-4 py-24 lg:px-10`}>
          <Reveal className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-2xl">
              <Eyebrow tone={c.green}>How a grade is computed</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Raw scores in, a transmuted grade out</h2>
              <p className={`mt-3 text-lg ${c.muted}`}>
                Each category counts for its weight. Their sum is the RS, which the TRANSMU table turns into a grade. Move the sliders.
              </p>
            </div>
            <div className="transition duration-700 group-data-[state=hidden]/reveal:translate-y-8 group-data-[state=hidden]/reveal:opacity-0">
              <GradeCalculator />
            </div>
          </Reveal>
        </section>

        {/* Terms and remarks */}
        <section className="px-4 py-24 lg:px-10">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-2xl">
              <Eyebrow>Terms and remarks</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Midterm, final, and the course grade</h2>
              <p className={`mt-3 text-lg ${c.muted}`}>
                Each term has its own RS and grade. The course grade averages the two RS and transmutes the result.
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
              {[
                ["Midterm", "RS 74.50", "2.25", "#c0c1ff"],
                ["Final", "RS 81.30", "2.00", "#7cc4ff"],
              ].map(([term, rs, g, tone], i) => (
                <div key={term} className="flex flex-1 items-center gap-3">
                  <div className="flex-1 rounded-3xl border border-white/10 bg-[#131b2e] p-5">
                    <p className="text-[11px] font-bold tracking-[0.16em] uppercase" style={{ color: tone }}>
                      {term}
                    </p>
                    <p className={`mt-2 font-mono text-sm ${c.muted}`}>{rs}</p>
                    <p className="font-display text-3xl font-bold">{g}</p>
                  </div>
                  <span className={`font-display text-2xl ${c.muted}`}>{i === 0 ? "+" : "="}</span>
                </div>
              ))}
              <div className="flex-1 rounded-3xl bg-gradient-to-br from-[#4edea3]/40 to-[#c0c1ff]/30 p-px">
                <div className="h-full rounded-[23px] bg-[#131b2e] p-5">
                  <p className="text-[11px] font-bold tracking-[0.16em] text-[#4edea3] uppercase">Course grade</p>
                  <p className={`mt-2 font-mono text-sm ${c.muted}`}>RS (74.50 + 81.30) ÷ 2 = 77.90</p>
                  <p className="flex items-center gap-3 font-display text-3xl font-bold">
                    2.00 <span className="rounded-lg bg-[#4edea3]/15 px-2.5 py-0.5 text-base text-[#4edea3]">P</span>
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {remarks.map(([code, name, text, style]) => (
                <div key={code} className="flex gap-4 rounded-2xl border border-white/10 bg-[#131b2e] p-5">
                  <span className={`grid size-12 shrink-0 place-items-center rounded-xl font-display text-lg font-bold ${style}`}>{code}</span>
                  <div>
                    <p className="font-semibold">{name}</p>
                    <p className={`mt-0.5 text-sm ${c.muted}`}>{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Attendance */}
        <section className={`relative isolate overflow-hidden border-t ${c.line} px-4 py-24 lg:px-10`}>
          <Backdrop
            photo="1517486808906-6ca8b3f04846"
            className="inset-0"
            shade="bg-[#0b1326]/80"
            mask="linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)"
          />
          <Reveal className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1fr_auto_1fr]">
            <div>
              <Eyebrow tone="text-[#ffb68a]">Attendance</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Roll call on your phone</h2>
              <p className={`mt-3 text-lg leading-relaxed ${c.muted}`}>
                Meetings come from the class schedule. Mark present, late, absent or excused, and absences feed the record by themselves.
              </p>
              <ul className="mt-6 space-y-2.5">
                {[
                  `${attendancePolicy.latesPerAbsence} lates count as 1 absence`,
                  `${attendancePolicy.dropAtAbsences} absences flag a drop, which you confirm`,
                  "Excused absences don't count",
                  "An attendance score fills in the record too",
                ].map((p) => (
                  <li key={p} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#ffb68a]" aria-hidden />
                    <span className="text-[#dae2fd]">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="transition duration-700 group-data-[state=hidden]/reveal:translate-y-8 group-data-[state=hidden]/reveal:opacity-0">
              <RollCallPhone />
            </div>
            <div className="transition delay-150 duration-700 group-data-[state=hidden]/reveal:translate-y-8 group-data-[state=hidden]/reveal:opacity-0">
              <AttendanceCounter />
            </div>
          </Reveal>
        </section>

        {/* Linked automatically */}
        <section className={`${c.lowest} px-4 py-24 lg:px-10`}>
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
            <div aria-hidden className="relative rounded-3xl border border-white/10 bg-[#131b2e] p-6">
              <p className={`text-[11px] font-bold tracking-[0.16em] uppercase ${c.muted}`}>Published in ENG 101 · BSED 1-A</p>
              <ul className="mt-4 space-y-2">
                {[
                  ["Quiz 1 · Subject–verb agreement", "Quizzes", true],
                  ["Quiz 2 · Fill in the blanks", "Quizzes", true],
                  ["Practice quiz", "—", false],
                  ["Midterm exam", "Major exam", true],
                ].map(([title, column, on]) => (
                  <li key={String(title)} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3 text-sm">
                    <ClipboardList className={`size-4 shrink-0 ${on ? "text-[#4edea3]" : "text-[#464554]"}`} />
                    <span className="min-w-0 flex-1 truncate">{title}</span>
                    <span className={`hidden text-xs sm:block ${on ? "text-[#4edea3]" : c.muted}`}>{on ? `→ ${column}` : "not counted"}</span>
                    <span className={`relative h-5 w-9 shrink-0 rounded-full ${on ? "bg-[#4edea3]" : "bg-white/10"}`}>
                      <span className={`absolute top-0.5 size-4 rounded-full bg-white ${on ? "left-[18px]" : "left-0.5"}`} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <Eyebrow tone={c.green}>Linked automatically</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">No copying scores between sheets</h2>
              <p className={`mt-3 text-lg leading-relaxed ${c.muted}`}>
                Publish a quiz or exam and it joins the class record. Scores land as students submit. A practice quiz can stay out with one
                switch.
              </p>
              <ul className="mt-6 space-y-2.5">
                {[
                  [Link2, "Quizzes and exams add themselves to the right category"],
                  [ToggleRight, "“Count in the class record” per quiz or exam"],
                  [CheckCircle2, "Remove one from the record and it stays out"],
                ].map(([Icon, text]) => {
                  const ItemIcon = Icon as LucideIcon;
                  return (
                    <li key={String(text)} className="flex items-start gap-2.5">
                      <ItemIcon className="mt-0.5 size-5 shrink-0 text-[#4edea3]" aria-hidden />
                      <span className="text-[#dae2fd]">{String(text)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* Printing and exports */}
        <section className="px-4 py-24 lg:px-10">
          <div className="mx-auto max-w-6xl">
            <div className="relative isolate mb-6 overflow-hidden rounded-3xl border border-white/10">
              <Image
                src="https://images.unsplash.com/photo-1551288049-bebda4e38f71"
                alt="Charts of class results on a laptop"
                fill
                sizes="(min-width: 1024px) 70vw, 100vw"
                className="-z-10 object-cover"
              />
              <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0b1326] via-[#0b1326]/85 to-[#0b1326]/30" />
              <div className="max-w-xl px-6 py-14 sm:px-10 sm:py-20">
                <Eyebrow>End of term</Eyebrow>
                <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">The paperwork, already done</h2>
                <p className={`mt-3 text-lg ${c.muted}`}>Print it or download it, whenever you need it.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {exports.map((e) => (
                <div key={e.title} className="group rounded-3xl border border-white/10 bg-[#131b2e] p-6 transition-colors hover:border-white/20">
                  <span className="grid size-11 place-items-center rounded-xl bg-[#c0c1ff]/15 text-[#c0c1ff] transition-transform group-hover:scale-105">
                    <e.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-display font-semibold">{e.title}</h3>
                  <p className={`mt-1.5 text-sm leading-relaxed ${c.muted}`}>{e.text}</p>
                  <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-[#c0c1ff]">
                    {e.icon === FileSpreadsheet || e.icon === CalendarDays ? <FileSpreadsheet className="size-3.5" /> : <Printer className="size-3.5" />}
                    {e.icon === FileSpreadsheet || e.icon === CalendarDays ? "Download .xlsx" : "Print"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Call to action */}
        <section className="px-4 pb-24 lg:px-10">
          <div className="relative isolate mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 overflow-hidden rounded-3xl border border-white/10 p-8 sm:flex-row sm:items-center lg:p-12">
            <Image src="https://images.unsplash.com/photo-1554224155-6726b3ff858f" alt="" fill sizes="100vw" className="-z-20 object-cover" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0b1326]/95 via-[#11192c]/85 to-[#11192c]/40" />
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Close the spreadsheet</h2>
              <p className={`mt-2 ${c.muted}`}>Sign in, or create an account with Google or any email.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={cta.href}
                className="inline-flex items-center gap-2 rounded-xl bg-[#4edea3] px-6 py-3 text-sm font-bold text-[#003824] hover:bg-[#6ffbbe]"
              >
                {cta.label} <ArrowRight className="size-4" aria-hidden />
              </Link>
              {!home && (
                <Link href="/register" className="inline-flex items-center rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold hover:bg-white/[0.06]">
                  Create an account
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter cta={cta} signedIn={home !== null} />
    </div>
  );
}
