---
type: concept
title: Classes, attendance and the class record
description: How classes, join codes and rosters work, how meetings are derived from a class schedule and roll calls stored, and how the class record (grade book) combines typed-in scores, linked quiz sessions and attendance into transmuted grades.
tags: [classes, roster, enrollment, attendance, class-record, grading]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T17:47:22.617Z
sources:
  - id: openwiki-source-e51bf44a1626461cc848defc
    resource: repo://apps/rpc/src/database/schemas/classes.ts
  - id: openwiki-source-57bf949517799550437bcbc8
    resource: repo://apps/rpc/src/handlers/AttendanceHandlers.ts
  - id: openwiki-source-d80efc9e6b4cb1182a6c7a3d
    resource: repo://apps/rpc/src/handlers/ClassHandlers.ts
  - id: openwiki-source-2e187b4c11e7345e5c365098
    resource: repo://apps/rpc/src/handlers/ClassRecordHandlers.ts
  - id: openwiki-source-c2d8063879ef0902c754ebd8
    resource: repo://apps/web/src/lib/data/attendance.ts
  - id: openwiki-source-81693b4b07e7bff5b9571c4c
    resource: repo://apps/web/src/lib/data/class-records.ts
  - id: openwiki-source-ff63213270d4fe03fedc7775
    resource: repo://apps/web/src/lib/grading.ts
  - id: openwiki-source-0ad3d59544759b6d244866da
    resource: repo://packages/contract/src/attendance.ts
generated: { by: "omp", at: "2026-10-09T17:47:22.617Z" }
---

# Classes, attendance and the class record

Three related features for teachers, with read-only student views. The API stores what people enter; derived values (meetings, linked scores, attendance scores, grades) are computed on every read.

## Classes and rosters

Tables: `classes`, `students` (roster entries), `class_members` (class ↔ roster entry) — see [Database schema](../data/database-schema.md).

- **Class** (`class.*`, `ClassHandlers`): owned by `teacher_id`. Fields are validated by `ClassFields` (course code, title, optional subject area, section, term, schedule, room, units 0–12). Archiving sets `archived_at`; archived classes are hidden from the teacher and students and nothing is deleted. Every class query filters `archived_at IS NULL` and `teacher_id = me`, failing with `NotFound("That class doesn't exist or isn't yours.")`.
- **Join code:** 7 characters from the look-alike-free alphabet, unique per class (collisions left to the unique constraint). `class.newJoinCode` replaces it; the old code stops working. Typed codes ignore case, spaces and dashes.
- **Roster entry** (`students`): a person on rosters, linked to at most one account by `user_id`. A student account gets one the first time it joins a class; Google Classroom imports create entries without an account and without student number/sex.

### Enrollment (`enrollment.*`)

`enrollment.join` (students only):

1. Rate-limited per student with `limits.joinCode`; only **wrong** codes count against the limit.
2. Looks up the non-archived class by normalized code.
3. Requires a student number and sex the first time (for the grade sheet), else `Conflict` with a message. An imported entry missing them is completed here.
4. Creates the roster entry if needed (`onConflictDoNothing` on `user_id` so a double submit is safe), inserts `class_members`, then adds the student to every **not-ended** session of the class (`session_students`).

`enrollment.leave` and `class.removeStudent` remove the membership and take the student off the class's not-ended sessions **they haven't started** (sessions with an attempt keep them).

**Claiming imported entries:** when a student with no roster entry calls an enrollment RPC, `claimImported` links an unowned entry whose email matches case-insensitively — but only if Better Auth marks the account's email as verified (Google sign-in). Email/password accounts never claim one, so nobody can take over a classmate's grades. The claimed entry's classes then add the student to their open sessions. See [Google Classroom](../integrations/google-classroom.md).

`class.students` returns roster entries the teacher may see: members of their classes plus students on rosters of their own sessions (classless sessions have whoever joined by key).

## Attendance

Shared rules live in `packages/contract/src/attendance.ts`:

- Meeting days come from the first token of the schedule (`"MWF 9:00…"` → Mon/Wed/Fri; `TTh`, `Sat`, `Su` understood).
- `meetingDates(schedule, until)` lists every meeting day from `academicCalendar.semesterStart` to today (capped at `semesterEnd`), newest first, in Manila time. Nothing is stored for a meeting until attendance is taken, so a new day's meeting appears on its own.
- `academicCalendar` is hard-coded (2026-08-10 → 2026-12-12, midterm ends 2026-10-10); `termOf(date)` splits midterm/final.
- `attendancePolicy`: 7 lates = 1 absence; `attendanceStanding` is `warning` at 3 effective absences and `drop` at 4. Excused absences don't count.

API (`AttendanceHandlers`):

- `attendance.meetings` / `attendance.today` merge schedule dates with stored roll calls (`class_meetings`, keyed by `(class_id, date)`), so a day taken before a schedule change still shows.
- `attendance.save` refuses a date that isn't a meeting that has happened (`Conflict`). It stores **only exceptions** (late/absent/excused) for students on the roster; everyone else is present. It upserts, so retaking replaces the roll call.
- `attendance.mine` returns the same meetings with only the student's own record.

## Class record (grade book)

Stored whole in `class_records` (one row per class, JSON columns): per-term categories with weights and `isExam`, items with `maxScore`, typed-in `scores[itemId][rosterId]`, `absences`, `dropped` (DR), `unlinked` sessions, and signatories.

**Save path:** `classRecord.save` runs `cleanRecord`: caps categories (20/term) and items (40/category), clamps numbers (weights ≤ 100, scores ≤ 1000, absences ≤ 200), cuts text, drops scores for students not on the roster, and keeps `sessionId` links only to the teacher's own sessions of that class. It returns what it kept. `classRecord.mine` returns only the caller's scores, absences and DR mark.

**Read path (web, `lib/data/class-records.ts`):**

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart LR
  Stored["classRecord.get<br/>(or blankRecord)"] --> AutoLink["autoLink:<br/>add class sessions as items"]
  Sessions["session.classScores"] --> AutoLink
  AutoLink --> Att["applyAttendance:<br/>absences + attendance items"]
  Meetings["attendance.meetings"] --> Att
  Att --> Grades["lib/grading.ts<br/>termResult / courseResult"]
  Sessions --> Linked["linkedScores:<br/>latest submitted attempt"] --> Grades
```

- A new record (`blankRecord`) starts with Quizzes 20, Assignments 15, Major Projects 15, Attendance/Participation 10 (with an attendance-sourced item), and the term exam 40.
- `autoLink` adds every session of the class that counts in the record and isn't already linked or in `unlinked`: exams go to the exam category, others to a non-exam category named like "quiz" (or the first non-exam one). The term comes from the session's grading period (prelim/midterm → midterm, prefinal/final → final) or its open date. Linked items always take the session's current total points.
- Linked scores are each student's latest submitted attempt, visible to the teacher whether or not results are released; ungraded essays stay empty (pending).
- `applyAttendance` (only once any roll call exists) sets each student's per-term effective absences and scores attendance items as meetings held minus effective absences.

**Grade math (`apps/web/src/lib/grading.ts`)**, matching the school's Excel sheet:

- Category = raw / max × weight; non-exam (ADW) categories are capped at their weight, the exam isn't.
- Term RS = ADW + exam; grade = `transmute(RS)` via the TRANSMU table (97→1.00 … 50→3.00 … below 9→5.00, VLOOKUP-style lowest-bound rows).
- Course RS = average of the two term RS, then transmuted.
- Remarks: `DR` if dropped; `P` if grade ≤ 3.00; otherwise `FA` when absences exceed `absenceLimit` (7) else `F`.

Note the two different absence thresholds: `attendancePolicy.dropAtAbsences` (4) flags a possible drop for the teacher to confirm, while `absenceLimit` (7) in `grading.ts` decides FA vs F.

The same math powers the student **Standing** page (`student.ts`), the printable **grade sheet**, and the **Summary report** (`getSummaryReport` counts P/F/FA/DR per class).
