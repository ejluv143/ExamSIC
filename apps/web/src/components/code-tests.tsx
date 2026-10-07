import clsx from "clsx";
import { Check, EyeOff, X } from "lucide-react";
import type { CodeTestCase, CodeTestResult } from "@/lib/types";

function Block({ label, text, tone }: { label: string; text: string; tone?: "danger" }) {
  return (
    <div className="min-w-0">
      <p className="mb-0.5 text-xs text-muted">{label}</p>
      <pre
        className={clsx(
          "max-h-40 overflow-auto rounded-md bg-surface-muted px-2.5 py-1.5 font-mono text-xs whitespace-pre-wrap",
          tone === "danger" && "text-danger",
        )}
      >
        {text || <span className="text-muted italic">(empty)</span>}
      </pre>
    </div>
  );
}

// Each test's input and expected output, plus what the program printed when results are given.
export function CodeTests({ tests, results }: { tests: CodeTestCase[]; results?: CodeTestResult[] }) {
  return (
    <ol className="space-y-2">
      {tests.map((t, i) => {
        const r = results?.find((x) => x.testId === t.id);
        return (
          <li key={t.id} className="rounded-lg border border-border p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              {r &&
                (r.passed ? (
                  <Check className="size-4 text-success" aria-label="Passed" />
                ) : (
                  <X className="size-4 text-danger" aria-label="Failed" />
                ))}
              Test {i + 1}
              {t.hidden && (
                <span className="inline-flex items-center gap-1 text-xs font-normal text-muted">
                  <EyeOff className="size-3.5" aria-hidden /> hidden from students
                </span>
              )}
              {r && (
                <span className={clsx("ml-auto text-xs", r.passed ? "text-success" : "text-danger")}>
                  {r.passed ? "Passed" : r.error ? "Error" : "Wrong output"}
                </span>
              )}
            </p>
            <div className={clsx("grid gap-2", r ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
              <Block label="Input" text={t.input} />
              <Block label="Expected output" text={t.expectedOutput} />
              {r && <Block label="Output" text={r.error ? `${r.output}\n${r.error}`.trim() : r.output} tone={r.error ? "danger" : undefined} />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
