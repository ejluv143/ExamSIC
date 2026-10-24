// Answers that couldn't be sent (no network) are kept on the phone, per attempt, until the server has them: the quiz
// can be put away or the app closed and the answers still go in when the phone is online again. The newest answer of
// a question replaces the older one. The server's deadline still wins: an answer it refuses (time is up) is dropped
// and the student is told.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AnswerValue, TypingEdits } from "@examinus/domain/quiz";

export type PendingSave = { value: AnswerValue; typing?: TypingEdits; timeSpentMs?: number };
export type PendingSaves = Record<string, PendingSave>;

const keyOf = (attemptId: string) => `examinus.pending.${attemptId}`;

// Writes run one after the other, so a put and a remove of the same attempt never interleave.
let tail: Promise<unknown> = Promise.resolve();
const serial = <A>(run: () => Promise<A>): Promise<A> => {
  const next = tail.then(run, run);
  tail = next.catch(() => undefined);
  return next;
};

async function read(attemptId: string): Promise<PendingSaves> {
  try {
    const raw = await AsyncStorage.getItem(keyOf(attemptId));
    return raw ? (JSON.parse(raw) as PendingSaves) : {};
  } catch {
    return {};
  }
}

async function write(attemptId: string, saves: PendingSaves) {
  if (Object.keys(saves).length === 0) await AsyncStorage.removeItem(keyOf(attemptId));
  else await AsyncStorage.setItem(keyOf(attemptId), JSON.stringify(saves));
}

const same = (a: AnswerValue, b: AnswerValue) => JSON.stringify(a) === JSON.stringify(b);

export const pendingSaves = {
  load: (attemptId: string): Promise<PendingSaves> => serial(() => read(attemptId)),

  put: (attemptId: string, questionId: string, save: PendingSave) =>
    serial(async () => write(attemptId, { ...(await read(attemptId)), [questionId]: save })),

  // Removes the question's saved answer once the server has it, unless a newer answer was kept meanwhile.
  settle: (attemptId: string, questionId: string, sent: AnswerValue) =>
    serial(async () => {
      const saves = await read(attemptId);
      const kept = saves[questionId];
      if (kept === undefined || !same(kept.value, sent)) return;
      delete saves[questionId];
      await write(attemptId, saves);
    }),

  clear: (attemptId: string) => serial(() => AsyncStorage.removeItem(keyOf(attemptId))),
};
