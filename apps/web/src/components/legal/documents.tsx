// The Terms of Service and Privacy Policy, shown on /terms and /privacy and in the pop-up on /register.
// Plain markup that takes its colors from where it's shown. Have a lawyer review both before launch.
import type { ReactNode } from "react";
import { CookieSettingsButton } from "@/components/cookie-consent";

// Who runs Examinus and how to reach them, shown in both documents. TODO before launch: the operator's name.
export const legal = {
  operator: "[Your name or business]",
  contactEmail: "ejloudalec13@gmail.com",
  effective: "October 8, 2026",
};

export function LegalBody({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6 text-sm leading-relaxed [&_a]:underline [&_h2]:font-display [&_h2]:text-base [&_h2]:font-semibold [&_li]:mt-1.5 [&_p]:mt-2 [&_strong]:font-semibold [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function TermsOfService() {
  return (
    <LegalBody>
      <p className="opacity-70">Effective {legal.effective}</p>
      <p>
        These terms are an agreement between you and {legal.operator} (&ldquo;we&rdquo;), who runs Examinus. By creating an
        account or using Examinus, you agree to them. If you don&apos;t agree, don&apos;t use Examinus.
      </p>

      <Section title="1. What Examinus is">
        <p>
          Examinus lets teachers create classes, quizzes and exams, grade them, and keep class records and attendance.
          Students join their teachers&apos; classes with a class code and take the quizzes and exams assigned to them.
        </p>
      </Section>

      <Section title="2. Your account">
        <ul>
          <li>
            Give your real name and an email address you use. Students give their student number when they first join
            a class.
          </li>
          <li>Keep your password to yourself. You&apos;re responsible for what happens under your account.</li>
          <li>One person, one account. Don&apos;t sign in as someone else or let anyone use your account.</li>
          <li>
            If you&apos;re under 18, a parent or guardian must agree to these terms and the Privacy Policy for you.
          </li>
        </ul>
      </Section>

      <Section title="3. Teachers">
        <ul>
          <li>You decide who joins your classes, what they take and how it&apos;s graded.</li>
          <li>
            You may only add students&apos; information that you&apos;re allowed to use, and only for teaching and
            grading. Follow your school&apos;s rules and the Data Privacy Act of 2012 when you do.
          </li>
          <li>Grades and records Examinus calculates are a tool; check them before you submit them to your school.</li>
        </ul>
      </Section>

      <Section title="4. Students">
        <ul>
          <li>Take quizzes and exams honestly and on your own, under the rules your teacher sets.</li>
          <li>
            Examinus&apos;s anti-cheating features, when your teacher turns them on, record things like leaving full
            screen or switching tabs. Your teacher sees these records; see the Privacy Policy for what is recorded.
          </li>
        </ul>
      </Section>

      <Section title="5. Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>cheat, or help others cheat, including with tools that answer, type or capture exams for you;</li>
          <li>get into accounts, classes or answer keys that aren&apos;t yours;</li>
          <li>upload anything unlawful, harmful, or that you don&apos;t have the right to share;</li>
          <li>submit code meant to attack, overload or escape Examinus&apos;s code runner;</li>
          <li>copy, resell or scrape Examinus, or get around its limits or security.</li>
        </ul>
      </Section>

      <Section title="6. Your content">
        <p>
          You own what you put into Examinus: your questions, quizzes, answers and records. You let us store, copy and
          show it only as needed to run Examinus for you and the people you share it with. Delete your account and we
          delete your content as the Privacy Policy describes.
        </p>
      </Section>

      <Section title="7. Plans and payment">
        <ul>
          <li>Students use Examinus for free. Teachers can use the Free plan or upgrade to Pro or Pro + AI.</li>
          <li>
            Prices are on the pricing page. When payments open, paid plans renew until cancelled; we&apos;ll tell you
            before a price changes.
          </li>
          <li>If a paid plan ends, your account moves to Free. Nothing is deleted, but paid features stop working.</li>
        </ul>
      </Section>

      <Section title="8. Availability and changes">
        <p>
          We work to keep Examinus running and your data safe, but we can&apos;t promise it will always be available or
          free of errors. Keep your own copies of important records, for example with the Excel downloads. We may
          change or stop features; we&apos;ll give notice of major changes.
        </p>
      </Section>

      <Section title="9. Suspension and closing accounts">
        <p>
          You can stop using Examinus at any time. We may suspend or close an account that breaks these terms, puts
          others at risk, or that the law requires us to act on.
        </p>
      </Section>

      <Section title="10. Liability">
        <p>
          Examinus is provided &ldquo;as is&rdquo;. As far as the law allows, we aren&apos;t liable for indirect losses,
          or for lost grades, data or profits, and our total liability is limited to what you paid us in the 12 months
          before the claim. Nothing here limits rights you have under Philippine consumer law.
        </p>
      </Section>

      <Section title="11. Changes to these terms">
        <p>
          We may update these terms. If a change matters, we&apos;ll tell you in Examinus or by email before it takes
          effect. Using Examinus after that means you accept the new terms.
        </p>
      </Section>

      <Section title="12. Governing law and contact">
        <p>
          These terms are governed by the laws of the Republic of the Philippines. Questions? Email{" "}
          <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>.
        </p>
      </Section>
    </LegalBody>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalBody>
      <p className="opacity-70">Effective {legal.effective}</p>
      <p>
        This policy explains what personal information Examinus collects, why, and your rights under the Data Privacy
        Act of 2012 (Republic Act No. 10173). {legal.operator} runs Examinus and is responsible for this information.
      </p>

      <Section title="1. What we collect">
        <ul>
          <li>
            <strong>Account:</strong> your name, email address, a securely hashed password (we never see the password
            itself), and whether you&apos;re a teacher or student.
          </li>
          <li>
            <strong>Google sign-in:</strong> if you use it, your name, email address and profile picture from Google.
          </li>
          <li>
            <strong>Classes:</strong> the classes you create or join. When students first join a class, they give their
            student number and their sex, which teachers&apos; grade sheets and attendance list separately.
          </li>
          <li>
            <strong>Schoolwork:</strong> questions, answers, scores, grades, class records and attendance.
          </li>
          <li>
            <strong>Exam activity</strong>, when a teacher turns on anti-cheating: when you leave full screen, switch
            tabs or apps, resize the window, connect a second screen, or try to copy, paste, print or take a
            screenshot; and, for code answers, how the answer was typed (a typing replay).
          </li>
          <li>
            <strong>Sign-in records:</strong> your IP address and browser, kept with your sessions for security.
          </li>
        </ul>
      </Section>

      <Section title="2. Why we use it">
        <ul>
          <li>to run your account and sign you in;</li>
          <li>to let teachers give, grade and record quizzes and exams, and students take them and see results;</li>
          <li>to keep exams fair, when the teacher asks for it;</li>
          <li>to keep Examinus secure and fix problems;</li>
          <li>to manage your plan, and to tell you about important changes.</li>
        </ul>
        <p>
          We use it because you agreed to these terms and this policy, because it&apos;s needed to provide the service
          you asked for, and where the law requires it. We don&apos;t sell your information or use it for advertising.
        </p>
      </Section>

      <Section title="3. Who sees it">
        <ul>
          <li>
            <strong>Your teachers</strong> see the names, student numbers, answers, scores, attendance and exam
            activity of the students in their classes.
          </li>
          <li>
            <strong>Students</strong> see their own work and results, and their class&apos;s name and schedule.
          </li>
          <li>
            <strong>Service providers</strong> that host Examinus&apos;s website, database and code runner, only to run
            it for us and under agreements that protect your information.
          </li>
          <li>
            <strong>Authorities</strong>, only when the law requires it.
          </li>
        </ul>
      </Section>

      <Section title="4. Cookies and your device">
        <p>Examinus sorts cookies into three kinds:</p>
        <ul>
          <li>
            <strong>Necessary</strong>, always on: they keep you signed in (<code>better-auth.*</code>), protect your
            account, and remember your cookie choice (<code>examora_consent</code>, for one year). While you take an
            exam, your browser also saves your answers so a reload doesn&apos;t lose them; they&apos;re removed when you
            submit.
          </li>
          <li>
            <strong>Preferences</strong> and <strong>analytics</strong>, only if you allow them. Examinus doesn&apos;t
            use either yet; if it starts to, they&apos;ll only run with your consent.
          </li>
        </ul>
        <p>
          There are no advertising cookies. You can change your choice any time with{" "}
          <CookieSettingsButton className="font-medium text-primary underline-offset-2 hover:underline" /> at the
          bottom of the site.
        </p>
      </Section>

      <Section title="5. How long we keep it">
        <p>
          We keep your information while your account is open. Schoolwork stays as long as the teacher keeps the class,
          so grades can be checked later. When an account is deleted, we delete or anonymize its information within 90
          days, except what the law requires us to keep.
        </p>
      </Section>

      <Section title="6. Security">
        <p>
          Passwords are hashed, connections are encrypted, and each person only sees what their role allows. No system
          is perfectly secure; if a breach affects you, we&apos;ll notify you and the National Privacy Commission as the
          law requires.
        </p>
      </Section>

      <Section title="7. Your rights">
        <p>Under the Data Privacy Act you can:</p>
        <ul>
          <li>be told how your information is used, and get a copy of it;</li>
          <li>have wrong information corrected;</li>
          <li>object to processing, or withdraw consent;</li>
          <li>have your information deleted or blocked, within what the law and your school records allow;</li>
          <li>get your information in a format you can take elsewhere;</li>
          <li>complain to the National Privacy Commission (privacy.gov.ph).</li>
        </ul>
        <p>
          To use these rights, email <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>. For grades and records in a class, you can
          also ask your teacher.
        </p>
      </Section>

      <Section title="8. Children">
        <p>
          Examinus is made for college students and their teachers. A student under 18 needs a parent or
          guardian&apos;s consent to use it.
        </p>
      </Section>

      <Section title="9. Changes">
        <p>
          We&apos;ll post any change here with a new effective date, and tell you in Examinus or by email if it matters.
        </p>
      </Section>
    </LegalBody>
  );
}
