// The accounts `pnpm db:seed` creates (apps/rpc/src/database/seed.ts), listed on the login page for
// development and demos. Keep the two in step.
export type DemoAccount = { role: "admin" | "teacher" | "student"; name: string; note: string; email: string; password: string };

export const demoAccounts: DemoAccount[] = [
  { role: "teacher", name: "Prof. Reyes", note: "Demo teacher with classes and data", email: "j.reyes@sic.edu.ph", password: "examora-demo" },
  { role: "student", name: "Hannah Ramos", note: "Demo student in IT302 and GEA101", email: "hannah.ramos@student.sic.edu.ph", password: "examora-demo" },
  { role: "admin", name: "Test Admin", note: "Manages accounts at /admin", email: "admin@sic.edu.ph", password: "12341234" },
  { role: "teacher", name: "Test Teacher", note: "Empty teacher account", email: "teacher@sic.edu.ph", password: "12341234" },
  { role: "student", name: "Test Student", note: "Same classes as Hannah", email: "student@sic.edu.ph", password: "12341234" },
];

// Shown while developing; in production only if SHOW_DEMO_ACCOUNTS=true (e.g. a demo server), never by accident.
export const showDemoAccounts = () =>
  process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_ACCOUNTS === "true";
