import type { CodeTestResult } from "@examinus/domain/kinds/base";
import { languageLabel } from "@examinus/question-kinds-core/code";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Badge, Button } from "@/ui/components";
import { CodeEditor } from "@/ui/code-editor";
import { CodeTests } from "@/ui/code-tests";
import { CodeResult, PlainPrompt, ResultFrame } from "./review-parts";
import type { KindInputProps, KindReviewProps } from "./types";

export function Input({ question: q, value: answer, onChange, onEdit, runOnServer, disabled }: KindInputProps<"code">) {
  const value = typeof answer === "string" ? answer : q.starterCode;
  const [results, setResults] = useState<readonly CodeTestResult[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [showTests, setShowTests] = useState(false);
  const [resetting, setResetting] = useState(false);
  // The code runner is on the API: without one, there is nothing to run.
  const canRun = q.tests.length > 0 && runOnServer !== undefined;
  const passed = results?.filter((r) => r.passed).length ?? 0;

  async function run() {
    if (!runOnServer) return;
    setRunning(true);
    setRunError(null);
    try {
      const reply = await runOnServer(q.id, value);
      if ("error" in reply) setRunError(reply.error);
      else if (reply.ok === null) setRunError("Code runner not available");
      else {
        setResults(reply.ok);
        setShowTests(true);
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "The code couldn't be run.");
    } finally {
      setRunning(false);
    }
  }

  const reset = () => {
    setResetting(false);
    setResults(null);
    if (onEdit) onEdit([{ from: 0, to: value.length, insert: q.starterCode }]);
    onChange(q.starterCode);
  };

  return (
    <View className="gap-3">
      {q.database && (
        <View className="gap-1">
          <Text className="text-sm font-medium text-foreground">Tables</Text>
          <View className="max-h-48 rounded-md bg-surface-muted p-3">
            <Text selectable className="text-xs text-foreground" style={{ fontFamily: "monospace" }}>
              {q.database}
            </Text>
          </View>
          <Text className="text-xs text-muted">
            Your code can query these tables with Laravel: DB::table(...), DB::select(...) or Eloquent models (use Illuminate\Database\Eloquent\Model;). Each test starts from this
            data.
          </Text>
        </View>
      )}
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge>{languageLabel[q.language]}</Badge>
        {q.database && <Badge tone="info">Laravel database</Badge>}
        <View className="flex-1" />
        {!disabled && (
          <Button variant="secondary" disabled={value === q.starterCode} onPress={() => setResetting(true)}>
            Reset
          </Button>
        )}
        {canRun && (
          <Button variant="secondary" disabled={running || disabled} busy={running} onPress={() => void run()}>
            Run sample tests
          </Button>
        )}
      </View>
      {resetting && (
        <View className="gap-2 rounded-lg border border-border bg-surface-muted p-3">
          <Text className="text-sm text-foreground">Replace your code with the starter code?</Text>
          <View className="flex-row gap-2">
            <Button variant="danger" onPress={reset}>
              Replace
            </Button>
            <Button variant="secondary" onPress={() => setResetting(false)}>
              Keep mine
            </Button>
          </View>
        </View>
      )}
      <CodeEditor value={value} starter={q.starterCode} onChange={onChange} onEdit={onEdit} disabled={disabled} label="Your code" />
      {runError && (
        <Text accessibilityRole="alert" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          {runError}
        </Text>
      )}
      {results && (
        <Text className={`text-sm font-medium ${passed === results.length ? "text-success" : "text-warning"}`}>
          Passed {passed} of {results.length} sample {results.length === 1 ? "test" : "tests"}. Your teacher&apos;s hidden tests are checked after you submit.
        </Text>
      )}
      {q.tests.length > 0 && (
        <View className="gap-2">
          <Pressable accessibilityRole="button" onPress={() => setShowTests((s) => !s)}>
            <Text className="text-sm text-muted">
              {showTests ? "▾" : "▸"} Sample {q.tests.length === 1 ? "test" : "tests"} ({q.tests.length})
            </Text>
          </Pressable>
          {showTests && <CodeTests tests={q.tests} results={results ?? undefined} />}
        </View>
      )}
      {!canRun && (
        <Text className="text-xs text-muted">
          {languageLabel[q.language]} can&apos;t run here. Check your logic against the samples; your code is tested after you submit.
        </Text>
      )}
    </View>
  );
}

export function Review({ question: q, answer, feedback, assetUrls: urls }: KindReviewProps<"code">) {
  return (
    <View className="gap-2">
      <PlainPrompt q={q} urls={urls} />
      <ResultFrame q={q} urls={urls} feedback={feedback}>
        <CodeResult q={q} answer={answer} />
      </ResultFrame>
    </View>
  );
}
