import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getMyAssessments, getMyClasses } from "@/lib/data/student";
import { AssessmentRow, bucketOf, type Bucket } from "../assessment-row";

export const metadata: Metadata = { title: "Quizzes & exams" };

const filters: { value: Bucket | "all"; label: string; empty: string }[] = [
  { value: "all", label: "All", empty: "No quizzes or exams yet" },
  { value: "todo", label: "To do", empty: "Nothing to take right now" },
  { value: "upcoming", label: "Upcoming", empty: "Nothing scheduled" },
  { value: "done", label: "Done", empty: "Nothing submitted yet" },
];

export default async function StudentAssessmentsPage(props: PageProps<"/student/assessments">) {
  const { show } = await props.searchParams;
  const filter = filters.find((f) => f.value === show) ?? filters[0];
  const [classes, items] = await Promise.all([getMyClasses(), getMyAssessments()]);
  const count = (value: Bucket | "all") => (value === "all" ? items.length : items.filter((i) => bucketOf(i) === value).length);
  const shown = filter.value === "all" ? items : items.filter((i) => bucketOf(i) === filter.value);

  return (
    <>
      <PageHeader title="Quizzes & exams" description="Everything assigned to your classes." />
      <nav aria-label="Filter" className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.value}
            href={f.value === "all" ? "/student/assessments" : `/student/assessments?show=${f.value}`}
            aria-current={f === filter ? "page" : undefined}
            className={clsx(
              "rounded-full border px-3 py-1.5 text-sm font-medium",
              f === filter
                ? "border-primary bg-primary-soft text-primary"
                : "border-border text-muted hover:bg-surface-muted hover:text-foreground",
            )}
          >
            {f.label} <span className="tabular-nums opacity-70">{count(f.value)}</span>
          </Link>
        ))}
      </nav>
      <Card>
        {shown.length === 0 ? (
          <EmptyState title={filter.empty} />
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((i) => (
              <AssessmentRow key={i.id} item={i} classes={classes} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
