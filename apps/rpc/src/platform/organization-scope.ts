// Which rows a person can reach, per kind of table. Every Repo asks here instead of composing `owner = me and
// organization = mine` itself, so the personal space (organization null) and its few exceptions live in one place.
//
// The rule: rows belong to an organization or, in the personal space, to none. A person works in one of them
// (`organizationId`, null for the personal space) and reaches only that one's rows. `eq` alone would match nothing
// for null, hence the helpers below. The deliberate exceptions, each named where it is defined:
//   - `assetsIn`, `ownedAssets`: a person without an organization reaches assets of any (guests upload into the
//     organization of their quiz, not their own).
//   - `quizzesPlayableBy`: the same for the quizzes a student plays; a personal-space quiz is gated by its session.
//   - `bankReach`: shares exist only inside an organization, and the demo library has no organization at all.
import { and, eq, exists, isNull, or, type Column, type SQL, sql } from "drizzle-orm";
import { assets, bankQuestions, bankShares, classes, quizzes, students } from "../database/schemas/index.ts";

// Who is asking: a teacher (actor) or a student (player), in an organization or the personal space (null).
export type Member = { id: string; organizationId: string | null };

// Rows in the organization a request works in: that organization's, or, in the personal space (null), those with
// none.
const organizationIs = (column: Column, organizationId: string | null): SQL =>
  organizationId === null ? isNull(column) : eq(column, organizationId);

// Rows the member owns, in the organization they work in (or the personal space).
const owned = (ownerId: Column, organizationId: Column, member: Member): SQL =>
  and(eq(ownerId, member.id), organizationIs(organizationId, member.organizationId))!;

// --- Owned rows ---

export const ownedQuizzes = (actor: Member): SQL => owned(quizzes.ownerId, quizzes.organizationId, actor);

export const ownedClasses = (actor: Member): SQL => owned(classes.teacherId, classes.organizationId, actor);

export const ownedBankQuestions = (actor: Member): SQL => owned(bankQuestions.ownerId, bankQuestions.organizationId, actor);

export const ownedShares = (actor: Member): SQL => owned(bankShares.ownerId, bankShares.organizationId, actor);

// --- Roster rows (`students`) ---

// The roster of an organization (or of the personal space): its `students` rows.
export const rosterOf = (organizationId: string | null): SQL => organizationIs(students.organizationId, organizationId);

// Roster rows in the same organization as another row's column, both possibly in none (`=` treats NULLs as
// different). For joining a student to a class or quiz they must belong to.
export const rosterBeside = (column: Column): SQL => sql`${students.organizationId} is not distinct from ${column}`;

// --- Shares ---

// Shares made or received in the organization (always one: the personal space has none).
export const sharesIn = (organizationId: string): SQL => eq(bankShares.organizationId, organizationId);

// THE visibility rule of the bank, used by every read of bank questions (the list, copy, and the images a teacher may
// see): the shared demo library (no owner, no organization), the actor's own questions in their organization, and what
// another teacher of the same organization shared with them, by question, by subject or by topic. Subject and topic
// shares are matched against the questions as they are now.
// Exception: shares exist only inside an organization, so the personal space sees none.
// Write it against `bank_questions` (select from it unaliased).
export const bankReach = (actor: Member): SQL =>
  or(
    and(isNull(bankQuestions.ownerId), isNull(bankQuestions.organizationId)),
    ownedBankQuestions(actor),
    actor.organizationId === null
      ? undefined
      : and(
          eq(bankQuestions.organizationId, actor.organizationId),
          exists(
            sql`(select 1 from ${bankShares}
        where ${bankShares.recipientId} = ${actor.id}
          and ${bankShares.organizationId} = ${actor.organizationId}
          and ${bankShares.ownerId} = ${bankQuestions.ownerId}
          and (
            (${bankShares.scope} = 'question' and ${bankShares.questionId} = ${bankQuestions.id})
            or (${bankShares.scope} = 'subject' and ${bankShares.subject} = ${bankQuestions.subject})
            or (${bankShares.scope} = 'topic' and ${bankShares.topic} = ${bankQuestions.topic})
          ))`,
          ),
        ),
  )!;

// --- Assets ---

// Assets of the organization. Exception: a person without an organization (a guest) reaches assets of any, so there
// is no filter for null.
export const assetsIn = (organizationId: string | null): SQL | undefined =>
  organizationId === null ? undefined : eq(assets.organizationId, organizationId);

// Assets the member uploaded (see `assetsIn` for the null exception).
export const ownedAssets = (owner: Member): SQL => and(eq(assets.ownerId, owner.id), assetsIn(owner.organizationId))!;

// --- Quizzes a student plays ---

// Quizzes a player may play: those of their organization. Exception: a player without an organization (a guest)
// plays quizzes of any; players in the personal space also pass, as a personal-space quiz is reached only through
// its session, which `game.find` gates.
export const quizzesPlayableBy = (player: Member): SQL | undefined =>
  player.organizationId === null ? undefined : eq(quizzes.organizationId, player.organizationId);
