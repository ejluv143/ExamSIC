---
type: concept
title: Classes, attendance and the class record
description: How classes and rosters work (join codes, roster entries per organization, imported entries claimed by verified email), what joining and leaving a class does to its sessions, how meetings are computed and roll calls stored, the attendance policy, and how the class record and grades are built.
tags: [classes, roster, enrollment, attendance, class-record, grading]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-18T15:19:56.756Z
sources:
  - id: openwiki-source-2a802674f88ad371850bec34
    resource: repo://apps/rpc/src/features/attendance/rules.ts
  - id: openwiki-source-984fc488bf6219d5ec2ffac7
    resource: repo://apps/rpc/src/features/attendance/Service.ts
  - id: openwiki-source-28bc74418020c245a00c9ba8
    resource: repo://apps/rpc/src/features/classes/Enrollment.ts
  - id: openwiki-source-a0e1f188f56d342862189e68
    resource: repo://apps/rpc/src/features/classes/Service.ts
  - id: openwiki-source-1648df2b455341432374a7b6
    resource: repo://apps/rpc/src/features/records/rules.ts
  - id: openwiki-source-f54dea50e021c043762ae4ed
    resource: repo://apps/rpc/src/features/records/Service.ts
  - id: openwiki-source-a814520e7137f66bb4cc526d
    resource: repo://apps/web/src/features/records/data/record.ts
  - id: openwiki-source-a9a8cb7335f32e2494123964
    resource: repo://apps/web/src/features/records/grading.ts
  - id: openwiki-source-951de9220f7b509075d92137
    resource: repo://packages/domain/src/attendance.ts
generated: { by: "omp", at: "2026-10-18T15:19:56.756Z" }
---

# Classes, attendance and the class record

A **class** belongs to a teacher inside an organization and has a schedule (day codes like `MWF`), a join code, members and an optional Google Classroom link. Members are **roster entries** (`students`): one per account and organization, with the student number and sex the grade sheet needs. Classes own three things downstream: the sessions run for them (see [Session lifecycle](../workflows/session-and-attempt-lifecycle.md)), attendance, and the class record.

## Classes (`features/classes/Service.ts`)

- Every teacher operation resolves the class through `ownClass`: the signed-in teacher's class in their active organization, **not archived**; anything else is `NotFound`. Archiving only sets `archived_at`, so an archived class keeps its sessions and records but disappears from lists.
- `newJoinCode` rotates the code; `removeStudent` takes a member off the class and out of the class's not-ended sessions where they have no attempt.

## Enrollment (`features/classes/Enrollment.ts`)

- `enrollment.join { code, studentNumber?, sex? }`: wrong codes are rate-limited per student (`limits.joinCode`, 10 per 10 minutes; only wrong codes count). The first time a student joins any class in an organization they must give a student number and sex (`Conflict` otherwise); afterwards the stored values are kept. The roster entry is created or reused idempotently, membership inserted, and the student is added to the class's sessions that haven't ended.
- `leave`: the reverse, keeping the student in sessions where they already have an attempt.
- **Claiming imported entries.** Google Classroom import creates roster entries with no account. When a student with no entry uses enrollment, `claimImported` links an unowned entry with the same email **only if the account's email is verified** (Google sign-in; never email/password sign-up), then joins the sessions of that entry's classes — so nobody takes over a classmate's grades by registering with their address. See [Google Classroom](../integrations/google-classroom.md).

## Attendance (`features/attendance`, `packages/domain/attendance.ts`)

- **Meetings are computed, not stored**: `meetingDates(schedule, until)` expands the class's day codes from `academicCalendar.semesterStart` to today (Manila time, `manilaDate`), and `termOf` assigns each date to the midterm or final term by `midtermEnd`. Only roll calls are stored (`class_meetings`, one row per class and date with the non-present statuses).
- `attendance.save` keeps only statuses for students on the roster and drops `present` (the default), upserting by class and date; `meetings` merges computed dates with stored roll calls so a date with a stored call still shows even if the schedule changed.
- **Policy** (`attendancePolicy`): 7 lates count as one absence; excused absences don't count; `effectiveAbsences = absent + floor(late / 7)`; standing is `warning` at 3 and `drop` at 4, where the teacher confirms a DR mark. Students see only their own tallies (`attendance.mine`).

## The class record (`features/records`, web `features/records`)

The record mirrors the school's Excel class record: categories with weights (ADW 60 + major exam 40), items with highest possible scores, typed-in scores, absences, DR marks and signatories, stored as JSON in `class_records`.

- **Server** (`RecordsService.save`, `records/rules.ts`): the saved record is sanitised — numbers clamped to sane ranges, text truncated, scores kept only for enrolled students, session links kept only for the teacher's sessions of that class. `records.mine` returns a student only their own scores.
- **Web** (`features/records/data/record.ts#prepareRecord`): sessions of the class are **linked automatically** (exams into the exam category, the rest into a quiz category) unless unlinked or not counted (`countInRecord`), each student's latest submitted attempt supplies the score, and the attendance item is filled with meetings held minus effective absences.
- **Grades** (`features/records/grading.ts`): ADW categories are capped at their weight, the term raw score is transmuted with the TRANSMU table (lowest raw score per grade, like `VLOOKUP(…, TRUE)`), the course grade transmutes the average of the two term raw scores, and the remark is `DR` when dropped, `P` for a passing grade, `FA` when absences exceed the limit, else `F`. The standing page shows students the same computation for their own row.

Excel downloads (class record, grade sheet, attendance per month) are built on the web server from the same data.
