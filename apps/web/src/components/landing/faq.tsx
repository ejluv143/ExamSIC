import { Plus } from "lucide-react";
import { revealDelay } from "./reveal";
import { SectionHeading } from "./section-heading";

// Questions teachers ask before signing up. Native <details>, so it opens without JavaScript and with the keyboard.
const faqs: [string, string][] = [
  [
    "Do students need an account?",
    "Not always. Students sign up once and join your class with its code, so their results stay in the class record. For a game, quiz or exam without a class you can let guests in: they open the join page, type the key and a name, and take it.",
  ],
  [
    "How does Examinus stop cheating without a webcam?",
    "Turn on the rules you want: full screen, a log of tab and app switches, one screen only, blocked copy, paste, right-click and printing, a watermark with the student's name, and a check for answers that came too fast. You see every event and decide what it means.",
  ],
  [
    "Which answers are graded automatically?",
    "Every type except essays and drawings: choices, blanks, matching, enumeration, numeric, ordering, categorization, hotspots, and code and SQL, which are run against your tests. Essays get a rubric, and with AI turned on, a suggested score you approve.",
  ],
  [
    "Can I still give the exam on paper?",
    "Yes. The same quiz prints as a test paper with your school's header and logos, points per part and an optional answer sheet.",
  ],
  [
    "Does it work with my class record?",
    "Scores flow into a class record with your columns, weights and transmutation table, alongside attendance. Download it in Excel or print the grade sheet.",
  ],
  [
    "Is the AI required?",
    "No. AI drafts questions, suggests essay scores and writes each student's coach report only when your school has added a key. Without it, everything else works and the coach uses a rule-based report.",
  ],
];

export function Faq() {
  return (
    <section aria-labelledby="faq" className="px-4 pb-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading id="faq" eyebrow="Questions" title="Good to know" />
        <div className="mt-12 grid gap-3 lg:grid-cols-2">
          {faqs.map(([question, answer], i) => (
            <details
              key={question}
              data-reveal
              style={revealDelay((i % 2) * 100)}
              className="group h-fit rounded-2xl border border-border bg-surface px-5 open:shadow-lg open:shadow-black/5"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                {question}
                <Plus className="size-5 shrink-0 text-primary transition-transform group-open:rotate-45" aria-hidden />
              </summary>
              <p className="pb-5 text-muted">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
