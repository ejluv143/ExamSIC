# Glossary

Domain terms and the module that owns each one. Code is authoritative; this names the seams.

| Term | Meaning | Owner |
|---|---|---|
| **Question kind** | Everything pure about one question type: defaults, validation, import, scoring, key text, label, subjects, editor facts. Web and mobile renderers are its two adapters. | `packages/domain/src/kinds/` |
| **Attempt paper** | The questions a student sees for one attempt, in seeded order, and the score and status that follow from their answers (`needs_grading` when any answer waits for a teacher). | `apps/rpc/src/features/attempt/paper.ts` |
| **Admission** | What a student sees of a session (accommodations, granted retakes) and whether they may open or start it, with client and device checks in one fixed order. | `apps/rpc/src/features/attempt/admission.ts` |
| **Attempt clock** | Whether an attempt is open, in grace, or expired at a moment; a paused session stops the clock. | `apps/rpc/src/features/session/clock.ts` |
| **Release** | When results and the answer key are visible to students. Shared by server and web. | `packages/domain/src/release.ts` |
| **Settings freeze** | Which session settings stay editable once a session has opened or started. | `packages/domain/src/freeze.ts` |
| **Organization scope** | Which rows an actor can reach. The personal space is the null organization; its named exceptions live here. | `apps/rpc/src/platform/organization-scope.ts` |
| **Session identity** | Turning request headers or a token into the current user and organization, including active-organization repair and plan expiry. | `apps/rpc/src/features/auth/Identity.ts` |
| **Membership** | Organization member rules: at least one owner, who may grant owner, valid roles, invites. | `apps/rpc/src/features/organization/Membership.ts` |
| **Feature registry** | Each rpc feature's repo, services and handlers, declared once in start-up order. | `apps/rpc/src/features/registry.ts` |
| **Take flow** | The student's whole attempt on a client: saving with retry and offline persistence, mark, leave question, start, submit. `TakeMode` is its seam (web server actions, mobile rpc). | `packages/taking/src/take-flow.ts` |
| **Session results** | The teacher's view of a finished session: latest submitted attempts, scores, topic totals, integrity. Shared by web and MCP. | `packages/domain/src/results.ts` |
| **Game view** | Following a live game on a client: server-clock skew, countdowns, team ranking, choice order. | `packages/client/src/game-view.ts` |
| **Session settings draft** | The teacher's unsaved session settings: seeding, presets, validation by area, the final input. | `apps/web/src/features/session/session-draft.ts` |
| **Quiz editing** | Edit operations on an unsaved quiz, dirty tracking, and the single question validation path. | `apps/web/src/features/quiz/quiz-editing.ts` |
| **Display copy** | How text, dates (Manila time), durations, part headings and end reasons read on every client. | `packages/copy/src/` |
| **Personal space** | A teacher's work outside any organization (`organizationId` null). | — |
