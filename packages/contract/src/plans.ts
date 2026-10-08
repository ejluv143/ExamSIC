// What each teacher plan offers, shown on /pricing. DRAFT: the Free limits aren't enforced yet; when they are,
// the checks read this same file, so the page and the limits always match. Students never pay.
import type { Plan } from "./roles.ts";

export type PlanInfo = {
  name: string;
  tagline: string;
  // Prices in pesos; 0 is free.
  monthly: number;
  yearly: number;
  // The plan whose features this one also has, listed as "Everything in …, plus:".
  includes?: Plan;
  features: string[];
};

export const plans: Record<Plan, PlanInfo> = {
  free: {
    name: "Free",
    tagline: "Everything you need to start giving quizzes and exams online.",
    monthly: 0,
    yearly: 0,
    features: [
      "Up to 3 classes, 40 students each",
      "Students join with a class code",
      "Quizzes and exams with automatic scoring",
      "Multiple choice, identification, enumeration, true/false, fill in the blanks, numeric and essay",
      "Question bank and Excel import",
      "Timer, schedules and retakes",
    ],
  },
  pro: {
    name: "Pro",
    tagline: "For teachers who run their whole course on Examinus.",
    monthly: 499.99,
    yearly: 4999.9,
    includes: "free",
    features: [
      "Unlimited classes and students",
      "Code and SQL questions, graded by running them",
      "Anti-cheating: full screen, tab-switch log, watermark and similarity check",
      "Typing replay for code answers",
      "Class record with transmuted grades and Excel download",
      "Attendance, grade sheet and summary report",
      "Printable test papers with your school's header",
    ],
  },
  ai: {
    name: "Pro + AI",
    tagline: "Let AI check the answers that take you the longest to grade.",
    monthly: 999.99,
    yearly: 9999.9,
    includes: "pro",
    features: [
      "AI auto evaluation of essays and open-ended answers",
      "Scores against your rubric, with feedback for each student",
      "AI checking of code and SQL answers beyond test cases",
      "You review and approve every AI score before students see it",
    ],
  },
};

// "₱1,990" or "₱499.99"
export const formatPeso = (amount: number) =>
  `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
