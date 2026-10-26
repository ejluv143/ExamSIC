// What an exam asks of the student on the phone before the usual start page (the web's `ExamGate`): the system check of
// the device, the honor pledge and the rules. `onDone` is called once all of it is accepted; the pledge is then sent
// with the start (`makeRpcTakeMode` `exam`).
import { examRulesMobile } from "@examinus/domain/exam";
import type { Session } from "@examinus/domain/quiz";
import type { SystemCheckResult } from "@examinus/taking/platform";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, Pressable, Text, View } from "react-native";
import { mobilePlatform } from "@/platform/mobile-platform";
import { endSystemCheck } from "@/platform/system-check";
import { Button, Card, Notice } from "@/ui/components";

const stepNames = ["System check", "Honor pledge", "Rules"] as const;

function Confirm({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} className="flex-row items-start gap-3 py-1 active:opacity-80">
      <View className={`mt-0.5 h-6 w-6 items-center justify-center rounded-md border ${checked ? "border-primary bg-primary" : "border-border bg-surface"}`}>
        {checked && <Text className="text-sm font-bold text-primary-foreground">✓</Text>}
      </View>
      <Text className="min-w-0 flex-1 text-sm text-foreground">{children}</Text>
    </Pressable>
  );
}

// The device check: runs when the step opens, again when the student comes back from Settings, and on request.
function SystemCheck({ onResult }: { onResult: (passed: boolean) => void }) {
  const [result, setResult] = useState<SystemCheckResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const latest = useRef(0);

  // Each run supersedes the previous one; a stale result is dropped. Both outcomes set state only once the check
  // has answered, never synchronously from the effect.
  const run = useCallback((round: number) => {
    mobilePlatform
      .systemCheck()
      .then((checked) => {
        if (round !== latest.current) return;
        setFailure(null);
        setResult(checked);
        onResult(checked.items.every((item) => item.ok));
      })
      .catch((e: unknown) => {
        if (round !== latest.current) return;
        onResult(false);
        setFailure(e instanceof Error ? e.message : "The check couldn't run.");
      });
  }, [onResult]);

  useEffect(() => {
    const rounds = latest;
    run(++rounds.current);
    const sub = AppState.addEventListener("change", (state) => state === "active" && run(++rounds.current));
    return () => {
      sub.remove();
      rounds.current++;
      endSystemCheck();
    };
  }, [run]);

  const failed = result?.items.filter((item) => !item.ok).length ?? 0;
  return (
    <View className="gap-3">
      {result === null && failure === null && (
        <View className="flex-row items-center gap-3">
          <ActivityIndicator />
          <Text className="text-sm text-muted">Checking…</Text>
        </View>
      )}
      {failure !== null && <Notice tone="danger">{failure}</Notice>}
      {result?.items.map((item) => (
        <View key={item.id} className="flex-row items-start gap-3" accessibilityLabel={`${item.label}: ${item.ok ? "passed" : "failed"}`}>
          <Text className={`mt-0.5 w-5 text-base font-bold ${item.ok ? "text-success" : "text-danger"}`}>{item.ok ? "✓" : "✕"}</Text>
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-medium text-foreground">{item.label}</Text>
            {item.ok ? item.detail !== undefined && <Text className="text-sm text-muted">{item.detail}</Text> : <Text className="text-sm text-danger">{item.fix}</Text>}
          </View>
        </View>
      ))}
      {result !== null && <Text className="text-sm text-muted">{failed === 0 ? "Everything passes." : `${failed} ${failed === 1 ? "check needs" : "checks need"} your attention before you can start.`}</Text>}
      {(failed > 0 || failure !== null) && (
        <Button variant="secondary" onPress={() => run(++latest.current)}>
          Check again
        </Button>
      )}
    </View>
  );
}

export function ExamGate({ exam, name, onDone, onBack }: { exam: NonNullable<Session["exam"]>; name: string; onDone: () => void; onBack: () => void }) {
  const [step, setStep] = useState(0);
  const [passed, setPassed] = useState(false);
  const [pledge, setPledge] = useState(false);
  const [rules, setRules] = useState(false);
  const ready = [passed, pledge, rules][step]!;
  const last = step === stepNames.length - 1;

  return (
    <Card>
      <View className="gap-1 border-b border-border bg-primary-soft px-5 py-4">
        <Text className="text-xs font-semibold uppercase text-primary">
          Exam · step {step + 1} of {stepNames.length}
        </Text>
        <Text className="text-xl font-semibold text-foreground">{stepNames[step]}</Text>
      </View>
      <View className="gap-4 p-5">
        {step === 0 && <SystemCheck onResult={setPassed} />}
        {step === 1 && (
          <>
            <Text className="text-sm text-muted">Signed in as {name}.</Text>
            <View className="rounded-lg border-l-4 border-primary bg-surface-muted p-4">
              <Text className="text-sm text-foreground">{exam.honorPledge}</Text>
            </View>
            <Confirm checked={pledge} onChange={setPledge}>
              I accept the honor pledge.
            </Confirm>
          </>
        )}
        {step === 2 && (
          <>
            <View className="gap-1.5">
              {examRulesMobile.map((rule) => (
                <Text key={rule} className="text-sm text-foreground">
                  • {rule}
                </Text>
              ))}
            </View>
            <Confirm checked={rules} onChange={setRules}>
              I read and understand the rules.
            </Confirm>
          </>
        )}
        <View className="flex-row gap-2 pt-2">
          <View className="flex-1">
            <Button variant="secondary" onPress={step === 0 ? onBack : () => setStep(step - 1)}>
              {step === 0 ? "← Back" : "Back"}
            </Button>
          </View>
          <View className="flex-1">
            <Button disabled={!ready} onPress={() => (last ? onDone() : setStep(step + 1))}>
              {last ? "Continue to start" : "Next"}
            </Button>
          </View>
        </View>
      </View>
    </Card>
  );
}
