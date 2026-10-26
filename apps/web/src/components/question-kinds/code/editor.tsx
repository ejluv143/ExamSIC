"use client";

import { Plus, X } from "lucide-react";
import { CodeEditor } from "@/components/code-editor";
import { Select } from "@/components/select";
import { Button, inputClass, Switch } from "@/components/ui";
import { languageLabel, laravelStarter, starterTemplates } from "@examinus/question-kinds-core/code";
import { sqlTemplate } from "@examinus/question-kinds-core/models/sql";
import type { CodeLanguage, CodeQuestion } from "@examinus/domain/kinds/code";
import { SqlTablesField } from "../shared/editor-sql-tables";
import { newId, weightsAdd, weightsRemove } from "@examinus/question-kinds-core/editor-shared";
import { mono } from "../shared/editor-fields";
import type { EditorProps } from "../views/editor";

export function Editor({ q, onChange }: EditorProps<"code">) {
  const setTest = (id: string, patch: Partial<CodeQuestion["tests"][number]>) =>
    onChange({ ...q, tests: q.tests.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Students write a program that reads the test input and prints the expected output. Each passing test earns an
        equal share of the points, or the weight you set below. Trailing spaces and blank lines at the end don&apos;t
        count.
      </p>
      <label className="block max-w-56 text-sm">
        <span className="mb-1 block font-medium">Language</span>
        <Select
          value={q.language}
          onChange={(language) => {
            // Swap in the new language's template unless the teacher wrote their own starter code.
            const untouched =
              !q.starterCode.trim() || q.starterCode === starterTemplates[q.language] || q.starterCode === laravelStarter;
            onChange({
              ...q,
              language,
              starterCode: untouched ? starterTemplates[language] : q.starterCode,
              // Tables are a PHP (Laravel) feature.
              database: language === "php" ? q.database : undefined,
            });
          }}
          options={(Object.entries(languageLabel) as [CodeLanguage, string][]).map(([value, label]) => ({ value, label }))}
          className="w-full"
        />
      </label>
      {q.language === "php" && (
        <div className="rounded-lg bg-surface-muted/60 p-3">
          <Switch
            checked={q.database !== undefined}
            onChange={(on) => {
              const untouched = !q.starterCode.trim() || q.starterCode === starterTemplates.php || q.starterCode === laravelStarter;
              onChange({
                ...q,
                database: on ? sqlTemplate : undefined,
                starterCode: untouched ? (on ? laravelStarter : starterTemplates.php) : q.starterCode,
              });
            }}
            label={<span className="font-medium">Give students a database (Laravel)</span>}
            description={
              <>
                Each test starts with these tables in a fresh database. Students can use Laravel&apos;s <code>DB</code>{" "}
                facade, query builder and Eloquent models, as in a Laravel app.
              </>
            }
          />
          {q.database !== undefined && (
            <div className="mt-3">
              <SqlTablesField value={q.database} onChange={(database) => onChange({ ...q, database })} />
            </div>
          )}
        </div>
      )}
      <div>
        <p className="mb-1 text-sm font-medium">Starter code</p>
        <p className="mb-1.5 text-xs text-muted">What students see in the editor when they start. Can be empty.</p>
        <CodeEditor
          value={q.starterCode}
          onChange={(starterCode) => onChange({ ...q, starterCode })}
          language={q.language}
          minLines={6}
          label="Starter code"
        />
      </div>
      <div>
        <p className="mb-1 text-sm font-medium">Test cases</p>
        <p className="mb-2 text-xs text-muted">
          Hidden tests are checked but never shown to students, so they can&apos;t write code that only fits the
          examples.
        </p>
        <ol className="space-y-3">
          {q.tests.map((t, i) => (
            <li key={t.id} className="rounded-lg bg-surface-muted/60 p-3">
              <div className="mb-2 flex items-center gap-3">
                <span className="text-sm font-medium">Test {i + 1}</span>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={t.hidden}
                    onChange={(e) => setTest(t.id, { hidden: e.target.checked })}
                    className="size-4 accent-primary"
                  />
                  Hidden
                </label>
                <Button
                  variant="ghost"
                  className="ml-auto px-2"
                  aria-label={`Remove test ${i + 1}`}
                  disabled={q.tests.length <= 1}
                  onClick={() => onChange({ ...q, tests: q.tests.filter((x) => x.id !== t.id), ...weightsRemove(q, i) })}
                >
                  <X className="size-4" />
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs text-muted">
                  Input
                  <textarea
                    value={t.input}
                    onChange={(e) => setTest(t.id, { input: e.target.value })}
                    rows={3}
                    spellCheck={false}
                    placeholder="(none)"
                    className={`${mono} mt-1 text-foreground`}
                  />
                </label>
                <label className="block text-xs text-muted">
                  Expected output
                  <textarea
                    value={t.expectedOutput}
                    onChange={(e) => setTest(t.id, { expectedOutput: e.target.value })}
                    rows={3}
                    spellCheck={false}
                    className={`${mono} mt-1 text-foreground`}
                  />
                </label>
              </div>
            </li>
          ))}
        </ol>
        <Button
          variant="ghost"
          className="mt-1 text-primary"
          onClick={() =>
            onChange({
              ...q,
              tests: [...q.tests, { id: newId(), input: "", expectedOutput: "", hidden: true }],
              ...weightsAdd(q),
            })
          }
        >
          <Plus className="size-4" /> Add test case
        </Button>
      </div>
      <textarea
        value={q.rubric}
        onChange={(e) => onChange({ ...q, rubric: e.target.value })}
        placeholder="Review notes (optional), e.g. must use a loop, readable names. Shown to you while grading."
        rows={2}
        className={inputClass}
      />
    </div>
  );
}
