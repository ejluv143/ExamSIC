// A code question's tests with what the program printed (the web's `CodeTests`), and a query result as a table
// (the web's `SqlTable`).
import type { CodeTestResult } from "@examinus/domain/kinds/base";
import type { CodeTestCase } from "@examinus/domain/kinds/code";
import type { SqlResult } from "@examinus/question-kinds-core/sql";
import { ScrollView, Text, View } from "react-native";

const mono = { fontFamily: "monospace" } as const;

function Block({ label, text, danger = false }: { label: string; text: string; danger?: boolean }) {
  return (
    <View>
      <Text className="mb-0.5 text-xs text-muted">{label}</Text>
      <ScrollView horizontal className="max-h-40 rounded-md bg-surface-muted" contentContainerClassName="px-2.5 py-1.5">
        {text ? (
          <Text className={`text-xs ${danger ? "text-danger" : "text-foreground"}`} style={mono}>
            {text}
          </Text>
        ) : (
          <Text className="text-xs italic text-muted">(empty)</Text>
        )}
      </ScrollView>
    </View>
  );
}

// Each test's input and expected output, plus what the program printed when results are given.
export function CodeTests({ tests, results }: { tests: readonly CodeTestCase[]; results?: readonly CodeTestResult[] }) {
  return (
    <View className="gap-2">
      {tests.map((t, i) => {
        const r = results?.find((x) => x.testId === t.id);
        return (
          <View key={t.id} className="gap-2 rounded-lg border border-border p-3">
            <View className="flex-row items-center gap-2">
              {r && (
                <Text className={`font-bold ${r.passed ? "text-success" : "text-danger"}`} accessibilityLabel={r.passed ? "Passed" : "Failed"}>
                  {r.passed ? "✓" : "✗"}
                </Text>
              )}
              <Text className="text-sm font-medium text-foreground">Test {i + 1}</Text>
              {r && (
                <Text className={`ml-auto text-xs ${r.passed ? "text-success" : "text-danger"}`}>
                  {r.passed ? "Passed" : r.error ? "Error" : "Wrong output"}
                </Text>
              )}
            </View>
            <Block label="Input" text={t.input} />
            <Block label="Expected output" text={t.expectedOutput} />
            {r && <Block label="Output" text={r.error ? `${r.output}\n${r.error}`.trim() : r.output} danger={!!r.error} />}
          </View>
        );
      })}
    </View>
  );
}

// A query result (or a table's rows) as a compact, scrollable table.
export function SqlTable({ result, caption }: { result: SqlResult; caption?: string }) {
  return (
    <View>
      {caption && <Text className="mb-1 text-xs font-medium text-muted">{caption}</Text>}
      {result.columns.length === 0 ? (
        <Text className="rounded-md bg-surface-muted px-3 py-2 text-xs text-muted">No rows</Text>
      ) : (
        <ScrollView horizontal className="rounded-md border border-border">
          <View>
            <View className="flex-row bg-surface-muted">
              {result.columns.map((c, i) => (
                <Text key={i} className="w-28 border-b border-border px-2.5 py-1.5 text-xs font-semibold text-foreground" style={mono}>
                  {c}
                </Text>
              ))}
            </View>
            {result.rows.map((row, i) => (
              <View key={i} className={`flex-row ${i % 2 === 1 ? "bg-surface-muted/50" : ""}`}>
                {row.map((v, j) =>
                  v === null ? (
                    <Text key={j} className="w-28 px-2.5 py-1 text-xs italic text-muted" style={mono}>
                      NULL
                    </Text>
                  ) : (
                    <Text key={j} className="w-28 px-2.5 py-1 text-xs text-foreground" style={mono}>
                      {v instanceof Uint8Array ? "(blob)" : String(v)}
                    </Text>
                  ),
                )}
              </View>
            ))}
            {result.rows.length === 0 && <Text className="px-2.5 py-1.5 text-xs italic text-muted">No rows</Text>}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
