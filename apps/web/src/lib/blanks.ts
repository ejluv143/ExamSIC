// Fill-in-the-blank prompts mark each blank inline: "A [primary key|PK] identifies a [row]."

export type PromptPart = { text: string } | { answers: string[] };

const blankPattern = /\[([^\]]*)\]/g;

export function splitAlternatives(value: string): string[] {
  return value.split("|").map((x) => x.trim()).filter(Boolean);
}

export function promptParts(prompt: string): PromptPart[] {
  const parts: PromptPart[] = [];
  let last = 0;
  for (const m of prompt.matchAll(blankPattern)) {
    if (m.index > last) parts.push({ text: prompt.slice(last, m.index) });
    parts.push({ answers: splitAlternatives(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < prompt.length) parts.push({ text: prompt.slice(last) });
  return parts;
}

// Accepted answers for each blank, in order.
export function blankAnswers(prompt: string): string[][] {
  return promptParts(prompt).flatMap((p) => ("answers" in p ? [p.answers] : []));
}

// The prompt as students see it, with each blank replaced by a line.
export function blankedPrompt(prompt: string): string {
  return prompt.replace(blankPattern, "_____");
}
