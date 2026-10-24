import { attendancePolicy } from "@examinus/domain/attendance";
import { passingGrade, type Remark } from "@examinus/domain/class-record";
import { Text, View } from "react-native";
import { loadStanding } from "@/lib/data";
import { useLoad } from "@/lib/use-load";
import { Badge, Card, EmptyState, Loadable, Notice, Screen } from "@/ui/components";

const remarkBadge: Record<Remark, { tone: "success" | "danger" | "warning" | "neutral"; label: string }> = {
  P: { tone: "success", label: "Passing" },
  F: { tone: "danger", label: "Failing so far" },
  FA: { tone: "danger", label: "Too many absences" },
  DR: { tone: "neutral", label: "Dropped" },
};

const fmtGrade = (g: number) => g.toFixed(2);

type Subject = Awaited<ReturnType<typeof loadStanding>>[number];
type Term = Subject["terms"]["midterm"];

function TermBreakdown({ label, term }: { label: string; term: Term }) {
  if (!term.started) {
    return (
      <View className="gap-1">
        <Text className="text-sm font-semibold text-foreground">{label}</Text>
        <Text className="text-sm text-muted">Nothing recorded yet.</Text>
      </View>
    );
  }
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-foreground">{label}</Text>
      <Text className="text-sm text-muted">
        Grade {fmtGrade(term.grade)} · raw {term.rawScore} · {term.weightSoFar}% of the term recorded
      </Text>
      {term.categories.map((c) => (
        <View key={c.name} className="gap-1 rounded-lg border border-border p-3">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 font-medium text-foreground">
              {c.name} <Text className="font-normal text-muted">{c.weight}%</Text>
            </Text>
            <Text className="text-sm text-muted">{c.result ? `${c.result.raw} / ${c.result.max} · ${c.result.weighted} of ${c.weight}` : "Not yet"}</Text>
          </View>
          {c.items.map((i) => (
            <View key={i.title} className="flex-row justify-between gap-3">
              <Text className="flex-1 text-xs text-muted" numberOfLines={1}>
                {i.title}
              </Text>
              <Text className="text-xs text-muted">{i.pending ? "Being graded" : !i.recorded ? "Not yet" : i.score === null ? "0 (missed)" : `${i.score} / ${i.maxScore}`}</Text>
            </View>
          ))}
        </View>
      ))}
      <Text className="text-xs text-muted">Absences this term: {term.absences}</Text>
    </View>
  );
}

export default function Standing() {
  const load = useLoad(loadStanding);
  return (
    <Screen
      load={load}
      title="Standing"
      description={`Your grade in each subject so far, the way your teacher's class record computes it. 1.00 is the highest; ${fmtGrade(passingGrade)} is passing.`}
    >
      <Loadable load={load}>
        {(subjects) =>
          subjects.length === 0 ? (
            <Card>
              <EmptyState title="You're not in any class yet" />
            </Card>
          ) : (
            subjects.map(({ class: c, terms, current, attendance }) => (
              <Card key={c.id} className="gap-4 p-4">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-xs font-semibold uppercase text-primary">{c.courseCode}</Text>
                    <Text className="font-semibold text-foreground">{c.title}</Text>
                    <Text className="text-sm text-muted">
                      {c.section} · {c.term}
                    </Text>
                  </View>
                  <View className="items-end gap-1">
                    <Text className="text-3xl font-semibold text-foreground">{current ? fmtGrade(current.grade) : "—"}</Text>
                    {current ? <Badge tone={remarkBadge[current.remark].tone}>{remarkBadge[current.remark].label}</Badge> : <Badge>No grades yet</Badge>}
                  </View>
                </View>
                {current && <Text className="text-xs text-muted">Raw score {current.rawScore}</Text>}
                {attendance.held > 0 && (
                  <Text className="text-xs text-muted">
                    {attendance.effectiveAbsences} of {attendancePolicy.dropAtAbsences} absences allowed used
                    {attendance.late > 0 && ` · ${attendance.late} ${attendance.late === 1 ? "late" : "lates"}`}
                  </Text>
                )}
                <TermBreakdown label="Midterm" term={terms.midterm} />
                <TermBreakdown label="Finals" term={terms.final} />
                {attendance.standing !== "ok" && (
                  <Notice tone={attendance.standing === "drop" ? "danger" : "warning"}>
                    {attendance.standing === "drop"
                      ? `You've reached ${attendancePolicy.dropAtAbsences} absences, the limit for this subject. Talk to your teacher: you may be dropped.`
                      : `You have ${attendance.effectiveAbsences} absences. One more and you reach ${attendancePolicy.dropAtAbsences}, which means being dropped.`}{" "}
                    ({attendancePolicy.latesPerAbsence} lates count as 1 absence; excused absences don&apos;t count.)
                  </Notice>
                )}
              </Card>
            ))
          )
        }
      </Loadable>
    </Screen>
  );
}
