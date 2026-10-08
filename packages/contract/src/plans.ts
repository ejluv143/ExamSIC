// What each teacher plan offers, shown on /pricing. DRAFT: the Free limits aren't enforced yet; when they are,
// the checks read this same file, so the page and the limits always match. Students never pay.
import type { Plan } from "./roles.ts";

export type PlanInfo = {
  name: string;
  tagline: string;
  // Prices in pesos; 0 is free.
  monthly: number;
  yearly: number;
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
    tagline: "For teachers who run their whole course on Examora.",
    monthly: 199,
    yearly: 1990,
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
};

// "₱1,990"
export const formatPeso = (amount: number) => `₱${amount.toLocaleString("en-PH")}`;
