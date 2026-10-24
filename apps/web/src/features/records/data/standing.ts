import "server-only";
import type { MyScore } from "@examinus/contract/attempt";
import { studentStanding, type ClassRecord } from "@examinus/domain/class-record";
import { read } from "@/lib/api/helpers";
import { me } from "@/features/classes/data";

// The student's grade in each subject so far, from the class record. Only their own scores leave here.
// The arithmetic is `studentStanding` in `@examinus/domain/class-record`, shared with the mobile app.
export async function getMyStanding() {
  const { user, myClasses } = await me({ enrollment: ["read"] });
  const [scores, meetingsByClass, recordByClass] = await Promise.all([
    read((api) => api["attempt.myScores"]()) as Promise<readonly MyScore[]>,
    // Their own attendance and class record in each class (the API leaves out classmates').
    Promise.all(myClasses.map((cls) => read((api) => api["attendance.mine"]({ classId: cls.id })))),
    Promise.all(myClasses.map((cls) => read((api) => api["classRecord.mine"]({ classId: cls.id })))),
  ]);

  return myClasses.map((cls, c) => ({
    class: cls,
    ...studentStanding({
      cls,
      studentId: user.studentId,
      stored: recordByClass[c] as ClassRecord | null,
      sessions: scores.filter((m) => m.classId === cls.id),
      meetings: meetingsByClass[c]!,
    }),
  }));
}
