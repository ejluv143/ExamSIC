import clsx from "clsx";
import { Check, X } from "lucide-react";
import type { CodeTestResult } from "@examinus/domain/kinds/base";

const checkLabel: Record<string, string> = { sample: "Sample data", hidden: "Hidden data", blank: "No answer" };

// Each automatic SQL check: the student's rows beside the rows the answer query returned.
export function SqlChecks({ results }: { results?: readonly CodeTestResult[] }) {
  if (!results) return <p className="text-sm text-muted">Not checked automatically. Compare the query with the answer above.</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        Automatic checks{" "}
        <span className="font-normal text-muted">
          · passed {results.filter((r) => r.passed).length} of {results.length}
        </span>
      </p>
      {results.map((r) => (
        <div key={r.testId} className="rounded-lg border border-border p-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium">
            {r.passed ? <Check className="size-4 text-success" aria-hidden /> : <X className="size-4 text-danger" aria-hidden />}
            {checkLabel[r.testId] ?? r.testId}
            <span className={clsx("ml-auto text-xs", r.passed ? "text-success" : "text-danger")}>
              {r.passed ? "Same rows" : r.error ? "Error" : "Different rows"}
            </span>
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-0.5 text-xs text-muted">Student&apos;s result</p>
              <pre className={clsx("max-h-48 overflow-auto rounded-md bg-surface-muted px-2.5 py-1.5 font-mono text-xs", r.error && "text-danger")}>
                {r.error ?? r.output}
              </pre>
            </div>
            {r.expected && (
              <div className="min-w-0">
                <p className="mb-0.5 text-xs text-muted">Expected</p>
                <pre className="max-h-48 overflow-auto rounded-md bg-surface-muted px-2.5 py-1.5 font-mono text-xs">
                  {r.expected}
                </pre>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
