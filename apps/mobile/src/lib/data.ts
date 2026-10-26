// What the student screens read from the API, one function per screen so a screen is one `useLoad`.
import type { ClassRecord } from "@examinus/domain/class-record";
import { studentStanding } from "@examinus/domain/class-record";
import { callApi } from "./api";

export const loadHome = async () => {
  const [enrollment, items] = await Promise.all([
    callApi((api) => api["enrollment.mine"]()),
    callApi((api) => api["attempt.mine"]()),
  ]);
  // The web's order: soonest deadline first.
  const sessions = [...items].sort((x, y) => (x.session.closesAt ?? "9999").localeCompare(y.session.closesAt ?? "9999"));
  return { classes: enrollment.classes, sessions };
};

export const loadResult = (sessionId: string) => callApi((api) => api["attempt.result"]({ sessionId }));

// Each class with the student's grade so far; the same arithmetic as the web's standing page.
export const loadStanding = async () => {
  const { student, classes } = await callApi((api) => api["enrollment.mine"]());
  const [scores, meetingsByClass, recordByClass] = await Promise.all([
    callApi((api) => api["attempt.myScores"]()),
    Promise.all(classes.map((cls) => callApi((api) => api["attendance.mine"]({ classId: cls.id })))),
    Promise.all(classes.map((cls) => callApi((api) => api["classRecord.mine"]({ classId: cls.id })))),
  ]);
  return classes.map((cls, c) => ({
    class: cls,
    ...studentStanding({
      cls,
      studentId: student?.id ?? "",
      stored: recordByClass[c] as ClassRecord | null,
      sessions: scores.filter((m) => m.classId === cls.id),
      meetings: meetingsByClass[c]!,
    }),
  }));
};

// Each class with the meetings held so far and the student's own mark in each.
export const loadAttendance = async () => {
  const { student, classes } = await callApi((api) => api["enrollment.mine"]());
  const meetings = await Promise.all(classes.map((cls) => callApi((api) => api["attendance.mine"]({ classId: cls.id }))));
  return classes.map((cls, c) => ({ class: cls, studentId: student?.id ?? "", meetings: meetings[c]! }));
};
