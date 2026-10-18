---
type: data
title: Database schema
description: The PostgreSQL schema as Drizzle declares it in apps/rpc/src/database/schemas — organizations and auth, classes and rosters, quizzes and questions, sessions (lobby, exit password), attempts, answers, team relay, integrity and audit tables, bank, assets and AI keys — plus id and jsonb conventions, the migration workflow and the CI drift check.
tags: [database, postgres, drizzle, schema, migrations]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-18T15:19:56.756Z
sources:
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-2611459ab4f9ee58475270b6
    resource: repo://apps/rpc/drizzle.config.ts
  - id: openwiki-source-99511fd8bf1707a24be78c1e
    resource: repo://apps/rpc/src/database/migrations/0011_guests.sql
  - id: openwiki-source-53975b3a2ce840a63d3181d9
    resource: repo://apps/rpc/src/database/schemas/_helpers.ts
  - id: openwiki-source-0fd480ce55ad800d392ae582
    resource: repo://apps/rpc/src/database/schemas/auth.ts
  - id: openwiki-source-e51bf44a1626461cc848defc
    resource: repo://apps/rpc/src/database/schemas/classes.ts
  - id: openwiki-source-6eee860fd504f2e3cebcb5f9
    resource: repo://apps/rpc/src/database/schemas/quiz.ts
  - id: openwiki-source-9819470b66e0baf642d8266a
    resource: repo://apps/rpc/src/database/set-plan.ts
  - id: openwiki-source-8deb5bdeb911c1ed7e23d9c9
    resource: repo://apps/rpc/src/features/attempt/rules.ts
  - id: openwiki-source-e22313300a6b2b6cf1c04fab
    resource: repo://apps/rpc/src/platform/ids.ts
  - id: openwiki-source-b3b990746920552205a2bc59
    resource: repo://apps/rpc/test/fixture/fixture.ts
generated: { by: "omp", at: "2026-10-18T15:19:56.756Z" }
---

# Database schema

Drizzle declares the schema in `apps/rpc/src/database/schemas/` (one file per area, re-exported by `index.ts`); migrations live in `apps/rpc/src/database/migrations/` with a `meta/_journal.json` (currently up to `0021_session_exit_password`). Any PostgreSQL 18 works; the development database is `examinus`.

## Conventions

- **Ids**: `newId(prefix)` makes `<prefix>-<UUID v7>` (`quiz-`, `part-`, `q-`, `session-`, `attempt-`…), so ids are time-ordered and say what they are. Better Auth's own tables keep its ids.
- **Enums are generated from domain literals**: `session_mode`, `session_status` (`scheduled | lobby | running | ended`), `question_type`, `integrity_event_type`, `incident_kind`, `user_role`, `subject_area`, `sex`, `asset_purpose`, `bank_share_scope`, `ai_provider`… Changing the literal list in `packages/domain` requires a migration.
- **`jsonValue`** (`_helpers.ts`) is a custom jsonb column for values that may be plain strings: Drizzle's `jsonb` would `JSON.parse` a text answer like `"42"` into a number, and Bun's client would double-encode strings on write, so the helper reads the decoded value as is and writes `(json)::text::jsonb`. Used for answers and similar free-form values.
- `timestamptz` columns, `created_at`/`updated_at` with `$onUpdate`, `onDelete: "cascade"` from owners to their rows (quiz → parts → questions; session → roster/attempts → answers), `set null` where a parent may be removed (a class on a session).

## Tables by area

| Area | Tables | Notes |
|---|---|---|
| Auth (`auth.ts`) | `users`, `sessions`, `accounts`, `verifications` | Better Auth tables. `users.role` is the platform role (`admin`, `user`, `guest`); a CHECK (`users_role_profile_check`, comparing `role::text` so a migration can add roles) ties each role to its profile: guests must be anonymous with no department. `plan` enum for teacher plans. |
| Organizations (`organizations.ts`) | `organizations`, `members` (comma-separated roles), `invitations`, `organization_roles` (custom roles), `organization_invites` | Every root table below carries `organization_id`; ownership checks filter by it. |
| Classes (`classes.ts`) | `classes`, `students` (one roster entry per account and organization; student numbers unique per organization), `class_members`, `class_meetings` (roll calls only; meetings are computed), `class_records` (the record as JSON) | See [Classes, attendance and the class record](../concepts/classes-attendance-and-class-record.md). |
| Quizzes (`quiz.ts`) | `quizzes`, `quiz_parts` (pool size, shuffle), `questions` (type enum + `body` jsonb, points, partial credit, game points, topic) | `answers` references `questions` with `restrict`, so a question with answers can't be deleted (the quiz lock). |
| Sessions | `quiz_sessions`, `session_students` | Mode, pacing, status, `opens_at`/`closes_at`, time limit, attempts allowed, results release, `integrity` jsonb (incl. `allowedClients`), `exam`/`mastery` jsonb, navigation and marks, late join, `room_password`, `exit_password`, `ip_allowlist`, guests, pause, game clock and position, relay settings. Join codes are unique among sessions that haven't ended (partial unique index). The roster snapshot has `joined_at` (lobby) and `removed_at` (kicked). |
| Attempts | `attempts`, `answers`, `code_results`, `typing_edits` | One attempt per `(session, student, attempt_number)` (unique). `attempts` carries seed, device id, IP, `last_seen_at`, deadline extras, lock, question position, game points/streak, mastery queue, coach report. `answers` is unique per attempt and question with `auto_score` (0..1), `manual_score` (points), feedback, `time_spent_ms`, marks and the game's `game_points_earned`. |
| Team relay | `session_teams`, `session_team_members`, `session_team_questions`, `session_team_guesses` | See [Game mode](../modes/game-mode.md). |
| Integrity and audit | `integrity_events` (enum type, time, duration), `incidents` (teacher actions), `answer_history` (every save in quiz and exam sessions — `keepsHistory`), `grade_changes` (score changes after release, with reason) | See [Exam mode and anti-cheating](../modes/exam-mode-and-integrity.md). |
| Bank, assets, AI | `bank_questions`, `bank_shares`; `assets` (purpose, status pending/ready, owner); `ai_keys` (encrypted per organization and provider) | |

## Migrations

```bash
npm run db:generate -- --name <change>   # after editing a schema file; commit the SQL and meta/
npm run db:migrate                       # apply to DATABASE_URL (drizzle-kit, Node)
npm run db:check                         # drizzle-kit's own consistency check
```

CI ("Check migrations are consistent") runs `db:generate` with a throwaway name on a fresh PostgreSQL 18 and fails if `apps/rpc/src/database/migrations` shows any change, then applies the migrations and loads the integration fixture. The production database is migrated by the deploy job when `MIGRATE_ON_DEPLOY` is set (see [Development and CI](../operations/development-and-ci.md)). The API container never migrates.

Scripts beside the schema: `set-plan.ts` (`npm run plan:set <email> <free|pro> [YYYY-MM-DD]` sets a teacher's plan until payments exist). Demo data is no longer a seed script; it lives in the integration test fixture (`apps/rpc/test/fixture`).
