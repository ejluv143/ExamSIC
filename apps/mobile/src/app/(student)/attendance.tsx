import { attendanceStanding, attendancePolicy, tally, type AttendanceStatus } from "@examinus/domain/attendance";
import { Text, View } from "react-native";
import { loadAttendance } from "@/lib/data";
import { formatMeetingDate } from "@/lib/format";
import { useLoad } from "@/lib/use-load";
import { Badge, Card, CardTitle, EmptyState, Loadable, Notice, Row, Screen } from "@/ui/components";

const statusBadge: Record<AttendanceStatus, { tone: "success" | "warning" | "danger" | "info"; label: string }> = {
  present: { tone: "success", label: "Present" },
  late: { tone: "warning", label: "Late" },
  absent: { tone: "danger", label: "Absent" },
  excused: { tone: "info", label: "Excused" },
};

// Your own attendance in each class, read-only: the meetings held so far (newest first) and your mark in each.
export default function Attendance() {
  const load = useLoad(loadAttendance);
  return (
    <Screen load={load} title="Attendance" description="Your own record of the class meetings held so far. Your teacher takes attendance.">
      <Loadable load={load}>
        {(classes) =>
          classes.length === 0 ? (
            <Card>
              <EmptyState title="You're not in any class yet" />
            </Card>
          ) : (
            classes.map(({ class: c, studentId, meetings }) => {
              const t = tally(meetings, studentId);
              const standing = attendanceStanding(t.effectiveAbsences);
              const held = meetings.filter((m) => m.takenAt);
              return (
                <Card key={c.id}>
                  <CardTitle>
                    {c.courseCode} · {c.section}
                  </CardTitle>
                  <View className="gap-1 border-b border-border px-4 py-3">
                    <Text className="text-sm text-foreground">
                      {t.held} held · {t.present} present · {t.late} late · {t.absent} absent · {t.excused} excused
                    </Text>
                    {t.held > 0 && (
                      <Text className="text-xs text-muted">
                        {t.effectiveAbsences} of {attendancePolicy.dropAtAbsences} absences allowed used ({attendancePolicy.latesPerAbsence} lates count as 1; excused don&apos;t count)
                      </Text>
                    )}
                  </View>
                  {standing !== "ok" && (
                    <View className="p-3">
                      <Notice tone={standing === "drop" ? "danger" : "warning"}>
                        {standing === "drop" ? "You've reached the absence limit for this subject." : "One more absence and you reach the limit for this subject."}
                      </Notice>
                    </View>
                  )}
                  {held.length === 0 ? (
                    <EmptyState title="No attendance taken yet" />
                  ) : (
                    held.map((m) => {
                      const status = m.records[studentId] ?? "present";
                      return (
                        <Row key={m.id}>
                          <Text className="flex-1 text-foreground">{formatMeetingDate(m.date)}</Text>
                          <Badge tone={statusBadge[status].tone}>{statusBadge[status].label}</Badge>
                        </Row>
                      );
                    })
                  )}
                </Card>
              );
            })
          )
        }
      </Loadable>
    </Screen>
  );
}
