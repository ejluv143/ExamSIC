// Identification questions mark each blank inline in the markdown prompt: "A {{primary key|PK}} identifies a
// {{row}}." A blank answered one letter per box starts with #: "The capital is {{#Manila}}." Students see the same
// prompt with every blank emptied ("A {{}} identifies a {{#}}."), the flag kept so the player knows which kind to draw.

export type Blank = { answers: string[]; boxes: boolean };
export type PromptPart = { text: string } | Blank;

const blankPattern = /\{\{([^{}]*)\}\}/g;

export function splitAlternatives(value: string): string[] {
  return value.split("|").map((x) => x.trim()).filter(Boolean);
}

// What is written between the braces: the accepted answers, and whether it is answered in letter boxes.
export function parseBlank(inner: string): Blank {
  const boxes = inner.startsWith("#");
  return { answers: splitAlternatives(boxes ? inner.slice(1) : inner), boxes };
}

// The marker for a blank, from its answers and kind.
export function blankMarker(answers: readonly string[], boxes: boolean): string {
  return `{{${boxes ? "#" : ""}${answers.join("|")}}}`;
}

export function promptParts(prompt: string): PromptPart[] {
  const parts: PromptPart[] = [];
  let last = 0;
  for (const m of prompt.matchAll(blankPattern)) {
    if (m.index > last) parts.push({ text: prompt.slice(last, m.index) });
    parts.push(parseBlank(m[1] ?? ""));
    last = m.index + m[0].length;
  }
  if (last < prompt.length) parts.push({ text: prompt.slice(last) });
  return parts;
}

export function blanks(prompt: string): Blank[] {
  return promptParts(prompt).flatMap((p) => ("answers" in p ? [p] : []));
}

// Accepted answers for each blank in the prompt, in order.
export function blankAnswers(prompt: string): string[][] {
  return blanks(prompt).map((b) => b.answers);
}

// For each blank, the word lengths to draw as letter boxes (from its first answer), or null for a line.
export function blankBoxes(prompt: string): (number[] | null)[] {
  return blanks(prompt).map((b) => {
    if (!b.boxes) return null;
    const words = (b.answers[0] ?? "").split(/\s+/).filter(Boolean);
    return words.length === 0 ? null : words.map((w) => w.length);
  });
}

// The prompt as students get it: every blank emptied, letter-box blanks still flagged.
export function emptyBlanks(prompt: string): string {
  return prompt.replace(blankPattern, (_, inner: string) => (inner.startsWith("#") ? "{{#}}" : "{{}}"));
}

export function blankCount(prompt: string): number {
  return [...prompt.matchAll(blankPattern)].length;
}

// The prompt with each blank written out as a line, for plain text (printing, exports).
export function blankedPrompt(prompt: string): string {
  return prompt.replace(blankPattern, "_____");
}

// The prompt with the blank at `index` rewritten.
export function replaceBlank(prompt: string, index: number, blank: Blank): string {
  let i = 0;
  return prompt.replace(blankPattern, (whole) => (i++ === index ? blankMarker(blank.answers, blank.boxes) : whole));
}
