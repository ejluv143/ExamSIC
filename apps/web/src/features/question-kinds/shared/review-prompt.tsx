import { Markdown } from "@/components/markdown";
import type { Question } from "@examinus/domain/question";

// The prompt as the results page shows it.
export function PlainPrompt({ q, urls }: { q: Question; urls: Record<string, string> }) {
  return (
    <Markdown className="min-w-0 flex-1" assetUrls={urls}>
      {q.prompt}
    </Markdown>
  );
}
