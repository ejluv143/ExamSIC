import { useEffect, useRef, useState } from "react";
import type { AiControls } from "@/features/ai/components/ai-grading-controls";
import { aiStatusAction, suggestGradeAction } from "@/features/ai/actions";
import { answerMap } from "@/features/session/attempt-view";
import type { AiOption } from "@examinus/contract/ai";
import type { AttemptDetail } from "@examinus/contract/session";
import type { AiFeedbackStyle, AiProvider } from "@examinus/domain/ai";
import { answerText } from "@examinus/domain/answer-text";
import type { Question } from "@examinus/domain/question";

const providerKey = "examinus.ai.provider";
const styleKey = "examinus.ai.feedbackStyle";

export type Batch = { done: number; total: number; running: boolean; error: string | null };

// What the grader and its student list use of the AI drafts.
export type AiDrafts = {
  options: readonly AiOption[];
  provider: AiProvider | undefined;
  style: AiFeedbackStyle;
  chooseProvider: (p: AiProvider) => void;
  chooseStyle: (s: AiFeedbackStyle) => void;
  controlsFor: (attemptId: string) => AiControls;
  batch: Batch | null;
  suggestAll: () => Promise<void>;
  stop: () => void;
};

// The AI drafts of a grading session: the providers the teacher can use (the controls stay hidden while there are
// none), the drafts kept with the answers and the ones asked for here, and the batch that asks for every ungraded
// essay.
export function useAiDrafts(questions: readonly Question[], attempts: readonly AttemptDetail[]): AiDrafts {
  const [options, setOptions] = useState<readonly AiOption[]>([]);
  const [chosenProvider, setChosenProvider] = useState<string | null>(null);
  const [style, setStyle] = useState<AiFeedbackStyle>("standard");
  // The saved choices are read with the options: the controls only show once those arrive.
  useEffect(() => {
    aiStatusAction().then((found) => {
      setOptions(found);
      setChosenProvider(localStorage.getItem(providerKey));
      if (localStorage.getItem(styleKey) === "caveman") setStyle("caveman");
    }, () => {});
  }, []);
  const provider = (options.find((o) => o.provider === chosenProvider) ?? options[0])?.provider;
  // Suggestions by `attemptId:questionId`: those the API kept with the answers, and the ones asked for here.
  const [suggestions, setSuggestions] = useState(
    () =>
      new Map(
        attempts.flatMap((d) =>
          Object.entries(d.aiSuggestions).map(([questionId, s]) => [`${d.attempt.id}:${questionId}`, s] as const),
        ),
      ),
  );
  const [batch, setBatch] = useState<Batch | null>(null);
  const stopBatch = useRef(false);

  function chooseProvider(p: AiProvider) {
    setChosenProvider(p);
    localStorage.setItem(providerKey, p);
  }

  function chooseStyle(s: AiFeedbackStyle) {
    setStyle(s);
    localStorage.setItem(styleKey, s);
  }

  // The message when the API refuses.
  async function suggest(attemptId: string, questionId: string): Promise<string | null> {
    if (!provider) return null;
    const result = await suggestGradeAction(attemptId, questionId, provider, style);
    if ("error" in result) return result.error;
    setSuggestions((m) => new Map(m).set(`${attemptId}:${questionId}`, result.ok));
    return null;
  }

  const controlsFor = (attemptId: string): AiControls => ({
    options,
    provider,
    onProvider: chooseProvider,
    style,
    onStyle: chooseStyle,
    suggestionFor: (questionId) => suggestions.get(`${attemptId}:${questionId}`),
    suggest: (questionId) => suggest(attemptId, questionId),
  });

  // One at a time, so the provider isn't flooded; stops at the first error. Only essays are drafted by the AI.
  async function suggestAll() {
    const targets = attempts.flatMap((d) =>
      questions
        .filter((q) => q.type === "essay")
        .filter((q) => {
          const answer = answerMap(d).get(q.id);
          return (
            answer?.manualScore == null && answerText(q, answer?.value).trim() !== "" && !suggestions.has(`${d.attempt.id}:${q.id}`)
          );
        })
        .map((q) => ({ attemptId: d.attempt.id, questionId: q.id })),
    );
    stopBatch.current = false;
    setBatch({ done: 0, total: targets.length, running: targets.length > 0, error: null });
    for (const [i, t] of targets.entries()) {
      if (stopBatch.current) break;
      const failure = await suggest(t.attemptId, t.questionId);
      if (failure) {
        setBatch({ done: i, total: targets.length, running: false, error: failure });
        return;
      }
      setBatch({ done: i + 1, total: targets.length, running: i + 1 < targets.length, error: null });
    }
    setBatch((b) => b && { ...b, running: false });
  }

  return {
    options,
    provider,
    style,
    chooseProvider,
    chooseStyle,
    controlsFor,
    batch,
    suggestAll,
    stop: () => {
      stopBatch.current = true;
    },
  };
}
