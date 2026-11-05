# Glossary

Domain terms and the module that owns each one. Code is authoritative; this names the seams.

| Term | Meaning | Owner |
|---|---|---|
| **Question kind** | Everything pure about one question type: defaults, validation, import, scoring, key text, label, subjects, editor facts. Web and mobile renderers are its two adapters. | `packages/domain/src/kinds/` |
| **Attempt paper** | The questions a student sees for one attempt, in seeded order, and the score and status that follow from their answers (`needs_grading` when any answer waits for a teacher). | `apps/rpc/src/features/attempt/paper.ts` |
| **Admission** | What a student sees of a session (accommodations, granted retakes) and whether they may open or start it, with client and device checks in one fixed order. | `apps/rpc/src/features/attempt/admission.ts` |
| **Attempt clock** | Whether an attempt is open, in grace, or expired at a moment; a paused session stops the clock. Also which attempts move, and by how much, when a pause ends or time is added for everyone (`planShift`). | `apps/rpc/src/features/session/clock.ts` |
| **Class roster** | Who is in a class and who is on the roster of its sessions: a student joins or leaves, an imported entry is claimed, a session gets or changes its class. One rule for who keeps a place (an attempt, or a teacher's removal from the session). | `apps/rpc/src/features/classes/Roster.ts` |
| **Release** | When results and the answer key are visible to students. Shared by server and web. | `packages/domain/src/release.ts` |
| **Settings freeze** | Which session settings stay editable once a session has opened or started. | `packages/domain/src/freeze.ts` |
| **Organization scope** | Which rows an actor can reach. The personal space is the null organization; its named exceptions live here. | `apps/rpc/src/platform/organization-scope.ts` |
| **Session identity** | Turning request headers or a token into the current user and organization, including active-organization repair and plan expiry. | `apps/rpc/src/features/auth/Identity.ts` |
| **Membership** | Organization member rules: at least one owner, who may grant owner, valid roles, invites. | `apps/rpc/src/features/organization/Membership.ts` |
| **Feature registry** | Each rpc feature's repo, services and handlers, declared once in start-up order. | `apps/rpc/src/features/registry.ts` |
| **Take flow** | The student's whole attempt on a client: saving with retry and offline persistence, mark, leave question, start, submit, and the attempt link (integrity events and check-in) that runs while taking. `TakeMode` is its seam (web server actions, mobile rpc). | `packages/taking/src/take-flow.ts`, `attempt-link.ts` |
| **Session results** | The teacher's whole view of a finished session in one call (`sessionResults`): a row per student, the summary, each question's tally, topic mastery, status counts. Also the one latest-submitted and final-score/percent rule. Shared by web, MCP and rpc. | `packages/domain/src/results.ts` |
| **Session integrity** | The anti-cheating case file of a finished session: ranked students, pair findings of every kind (one population, threshold and verdict, the same ones that count toward a level), alert summaries, odd typing, and the drill-down into one pair. Pages, export and MCP read it. | `packages/domain/src/session-integrity.ts` |
| **Game view** | Following a live game on a client: server-clock skew, countdowns, team ranking, choice order, and what a player's screen shows and may do (`playerState`: screen, lobby face, locked, tap-to-answer, rescue, result headline, rank moved). | `packages/client/src/game-view.ts` |
| **Room transitions** | Every change to a live game room: one serialised operation under the room's lock that applies the rules, writes through the repo and picks who is told (relay vs classic, pacing inside). | `apps/rpc/src/features/game/Transitions.ts` |
| **Game stage** | What a game screen is at (phase, question, clock, reveal, finished, own result) for a viewer: pure over the room, so what a role may see is tested. | `apps/rpc/src/features/game/Stage.ts` |
| **Teacher view** | The teacher's live picture of a running session: rows, answers, approvals (waiting for a device change), alerts and toasts, reduced from the teacher stream. Pure; the device-change lookup is a request the caller answers. Web live view and "Taking it now" render from it. | `packages/client/src/teacher-view.ts` |
| **Session settings draft** | The teacher's unsaved session settings: seeding, presets, validation by area, the final input. | `apps/web/src/features/session/session-draft.ts` |
| **Quiz editing** | Edit operations on an unsaved quiz (cards and table alike), dirty tracking, and the single question validation path. Part names and question numbering come from `packages/copy/src/paper.ts`. | `apps/web/src/features/quiz/quiz-editing.ts` |
| **Display copy** | How text, dates (Manila time), durations, part headings and end reasons read on every client. | `packages/copy/src/` |
| **Personal space** | A teacher's work outside any organization (`organizationId` null). | — |
| **Class record** | A class's grade book: grade math, filling it in from sessions and attendance (`teacherRecord`, `studentStandings`), every teacher edit (including what `unlinked` holds), and the one roster order (`rosterGroups`). Web and mobile call it. | `packages/domain/src/class-record.ts` |
