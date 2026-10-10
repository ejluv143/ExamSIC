"use client";

import { useEffect, useState } from "react";
import type { AiOption } from "@examora/contract";
import { AiGenerate } from "@/components/ai-generate";
import { Markdown } from "@/components/markdown";
import { aiStatusAction } from "@/lib/ai/actions";
import { addToBankAction } from "./actions";
import { AnswerKey } from "./bank-list";

const noUrls: Record<string, string> = {};

// "Generate with AI" on the question bank: the teacher picks which drafts go into their own bank.
export function AiBankGenerate() {
  const [options, setOptions] = useState<readonly AiOption[] | null>(null);
  useEffect(() => {
    aiStatusAction().then(setOptions, () => setOptions([]));
  }, []);

  return (
    <div className="flex flex-wrap gap-2">
      <AiGenerate
        options={options}
        description="The AI drafts the questions; you pick which to add to your question bank."
        review={{
          saveLabel: "Add to bank",
          preview: (q) => (
            <>
              <Markdown>{q.prompt}</Markdown>
              <AnswerKey q={q} urls={noUrls} />
            </>
          ),
          save: async (questions) => {
            const result = await addToBankAction(questions);
            return "error" in result ? result.error : null;
          },
        }}
      />
    </div>
  );
}
