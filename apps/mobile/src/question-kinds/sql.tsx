import { Text, View } from "react-native";
import { useState } from "react";
import { Badge, Button } from "@/ui/components";
import { CodeEditor } from "@/ui/code-editor";
import { SqlTable } from "@/ui/code-tests";
import { CodeResult, PlainPrompt, ResultFrame } from "./review-parts";
import type { KindInputProps, KindReviewProps } from "./types";

// A query against the question's tables. The web runs it in the browser (sql.js) and compares the result; the API's
// sample runner only takes code questions and a phone has no SQL engine, so here the student reads the tables and the
// expected result and writes the query; it is checked after they submit.
export function Input({ question: q, value: answer, onChange, onEdit, disabled }: KindInputProps<"sql">) {
  const value = typeof answer === "string" ? answer : q.starterCode;
  const sample = q.sampleResult;
  const [resetting, setResetting] = useState(false);

  const reset = () => {
    setResetting(false);
    if (onEdit) onEdit([{ from: 0, to: value.length, insert: q.starterCode }]);
    onChange(q.starterCode);
  };

  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text className="text-sm font-medium text-foreground">Tables</Text>
        <View className="max-h-64 rounded-md bg-surface-muted p-3">
          <Text selectable className="text-xs text-foreground" style={{ fontFamily: "monospace" }}>
            {q.setupSql}
          </Text>
        </View>
      </View>
      {sample && (
        <SqlTable
          result={{ columns: [...sample.columns], rows: sample.rows.map((r) => [...r]) }}
          caption={`Expected result on this data${q.orderMatters ? " (in this order)" : " (any order)"}`}
        />
      )}
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge>SQLite</Badge>
        <View className="flex-1" />
        {!disabled && (
          <Button variant="secondary" disabled={value === q.starterCode} onPress={() => setResetting(true)}>
            Reset
          </Button>
        )}
      </View>
      {resetting && (
        <View className="gap-2 rounded-lg border border-border bg-surface-muted p-3">
          <Text className="text-sm text-foreground">Replace your query with the starter query?</Text>
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
      <CodeEditor value={value} starter={q.starterCode} onChange={onChange} onEdit={onEdit} disabled={disabled} label="Your query" minLines={5} />
    </View>
  );
}

export function Review({ question: q, answer, feedback, assetUrls: urls }: KindReviewProps<"sql">) {
  return (
    <View className="gap-2">
      <PlainPrompt q={q} urls={urls} />
      <ResultFrame q={q} urls={urls} feedback={feedback}>
        <CodeResult q={q} answer={answer} />
      </ResultFrame>
    </View>
  );
}
