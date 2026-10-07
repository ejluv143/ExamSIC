// Blank questions mark each blank inline in the markdown prompt: "A {{primary key|PK}} identifies a {{row}}."
// Students see the same prompt with every blank emptied: "A {{}} identifies a {{}}."

export type PromptPart = { text: string } | { answers: string[] };

const blankPattern = /\{\{([^{}]*)\}\}/g;

export function splitAlternatives(value: string): string[] {
  return value.split("|").map((x) => x.trim()).filter(Boolean);
}

export function promptParts(prompt: string): PromptPart[] {
  const parts: PromptPart[] = [];
  let last = 0;
  for (const m of prompt.matchAll(blankPattern)) {
    if (m.index > last) parts.push({ text: prompt.slice(last, m.index) });
    parts.push({ answers: splitAlternatives(m[1] ?? "") });
    last = m.index + m[0].length;
  }
  if (last < prompt.length) parts.push({ text: prompt.slice(last) });
  return parts;
}

// Accepted answers for each blank in the prompt, in order.
export function blankAnswers(prompt: string): string[][] {
  return promptParts(prompt).flatMap((p) => ("answers" in p ? [p.answers] : []));
}

// The prompt as students get it: every blank emptied.
export function emptyBlanks(prompt: string): string {
  return prompt.replace(blankPattern, "{{}}");
}

export function blankCount(prompt: string): number {
  return [...prompt.matchAll(blankPattern)].length;
}

// The prompt with each blank written out as a line, for plain text (printing, exports).
export function blankedPrompt(prompt: string): string {
  return prompt.replace(blankPattern, "_____");
}
