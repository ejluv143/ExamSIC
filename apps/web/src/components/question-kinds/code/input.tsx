"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Play, RotateCcw } from "lucide-react";
import type { CodeTestResult } from "@examinus/domain/kinds/base";
import { CodeEditor } from "@/components/code-editor";
import { CodeTests } from "@/components/code-tests";
import { Badge, Button } from "@/components/ui";
import { languageLabel, runsInBrowser } from "@examinus/question-kinds-core/code";
import { runJsTests } from "@/components/question-kinds/run-js";
import { preloadPython, runPythonTests } from "@/components/question-kinds/run-python";
import { TablesPreview } from "../shared/input-tables-preview";
import type { InputProps } from "../views/input";

export function Input({ q, value: answer, onChange, runOnServer, onEdit }: InputProps<"code">) {
  const value = typeof answer === "string" ? answer : q.starterCode;
  const [results, setResults] = useState<readonly CodeTestResult[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  // JavaScript runs right here; other languages go to the code runner when there is one.
  const inBrowser = runsInBrowser(q.language);
  const canRun = q.tests.length > 0 && (inBrowser || !!runOnServer);
  const passed = results?.filter((r) => r.passed).length ?? 0;

  // Python takes a few seconds to load the first time, so start as soon as the question is on screen.
  useEffect(() => {
    if (q.language === "python") preloadPython();
  }, [q.language]);

  async function run() {
    setRunning(true);
    setRunError(null);
    if (q.language === "python") {
      const reply = await runPythonTests(value, q.tests);
      if ("error" in reply) setRunError(reply.error);
      else setResults(reply);
    } else if (inBrowser) setResults(await runJsTests(value, q.tests));
    else {
      const reply = await runOnServer!(q.id, value);
      if ("error" in reply) setRunError(reply.error);
      else if (reply.ok === null) setRunError("Code runner not available");
      else setResults(reply.ok);
    }
    setRunning(false);
  }

  return (
    <div className="space-y-3">
      {q.database && (
        <>
          <TablesPreview setup={q.database} />
          <p className="text-xs text-muted">
            Your code can query these tables with Laravel: <code>DB::table(...)</code>, <code>DB::select(...)</code>{" "}
            or Eloquent models (<code>use Illuminate\Database\Eloquent\Model;</code>). Each test starts from this data.
          </p>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{languageLabel[q.language]}</Badge>
        {q.database && <Badge tone="info">Laravel database</Badge>}
        <span className="flex-1" />
        <Button
          variant="ghost"
          className="px-2.5 py-1.5 text-xs"
          disabled={value === q.starterCode}
          onClick={() => {
            if (window.confirm("Replace your code with the starter code?")) {
              onChange(q.starterCode);
              setResults(null);
            }
          }}
        >
          <RotateCcw className="size-3.5" aria-hidden /> Reset
        </Button>
        {canRun && (
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={run} disabled={running}>
            <Play className="size-3.5" aria-hidden />{" "}
            {running
              ? q.language === "python"
                ? "Running (Python loads the first time)…"
                : inBrowser
                  ? "Running…"
                  : "Compiling and running…"
              : "Run sample tests"}
          </Button>
        )}
      </div>
      <CodeEditor value={value} onChange={onChange} onEdit={onEdit} language={q.language} label="Your code" />
      {runError && (
        <p role="status" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          {runError}
        </p>
      )}
      {results && (
        <p
          role="status"
          className={clsx("text-sm font-medium", passed === results.length ? "text-success" : "text-warning")}
        >
          Passed {passed} of {results.length} sample {results.length === 1 ? "test" : "tests"}. Your teacher&apos;s
          hidden tests are checked after you submit.
        </p>
      )}
      {q.tests.length > 0 && (
        <details open={!!results}>
          <summary className="cursor-pointer text-sm text-muted">
            Sample {q.tests.length === 1 ? "test" : "tests"} ({q.tests.length})
          </summary>
          <div className="mt-2">
            <CodeTests tests={q.tests} results={results ?? undefined} />
          </div>
        </details>
      )}
      {!canRun && (
        <p className="text-xs text-muted">
          {languageLabel[q.language]} can&apos;t run in the browser yet. Check your logic against the samples; your
          code is tested after you submit.
        </p>
      )}
    </div>
  );
}
