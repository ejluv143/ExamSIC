// Finds suspiciously similar code and SQL answers, the way MOSS does: answers become token streams
// (names, strings and numbers replaced, comments dropped), token sequences are hashed, and a sample of
// those hashes ("winnowing") is compared between every pair. Renaming variables or reformatting doesn't hide a copy.

// Words kept as themselves; any other name becomes "ID". Covers Python, Java, C/C++, JavaScript and SQL.
const keywords = new Set(
  `and as assert async await break case catch char class const continue def default del do double elif else
  enum except extends false final finally float for from function global if import in instanceof int interface
  is lambda let long new none nonlocal not null or pass private protected public raise return self short static
  string struct super switch this throw throws true try typeof unsigned var void while with yield print input
  range len printf scanf cin cout endl include std using namespace main system out println scanner
  select distinct from where group by having order asc desc limit offset join inner left right outer full cross
  on union all exists between like is case when then end count sum avg min max coalesce
  echo foreach elseif fn array isset empty unset trim fgets stdin explode implode db table get first pluck
  model use extends belongstomany hasmany belongsto orderby groupby wherein collect`.split(/\s+/),
);

// Which comment styles to drop: -- in SQL, # in Python, // and /* */ in the C family and JavaScript,
// and all three (#, //, /* */) in PHP.
export type SourceKind = "sql" | "python" | "c-like" | "php";

export function sourceKind(language: string): SourceKind {
  return language === "sql" || language === "python" || language === "php" ? language : "c-like";
}

export function tokenize(source: string, kind: SourceKind): string[] {
  let text = source;
  if (kind === "python") text = text.replace(/#[^\n]*/g, " ");
  else if (kind === "php") text = text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(\/\/|#)[^\n]*/g, " ");
  else {
    text = text.replace(/\/\*[\s\S]*?\*\//g, " ");
    text = text.replace(kind === "sql" ? /--[^\n]*/g : /\/\/[^\n]*/g, " ");
  }
  const tokens: string[] = [];
  const re = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\d+(?:\.\d+)?|[A-Za-z_]\w*|[^\s\w]/g;
  for (const [t] of text.matchAll(re)) {
    if (/^["'`]/.test(t)) tokens.push("STR");
    else if (/^\d/.test(t)) tokens.push("NUM");
    else if (/^[A-Za-z_]/.test(t)) tokens.push(keywords.has(t.toLowerCase()) ? t.toLowerCase() : "ID");
    else tokens.push(t);
  }
  return tokens;
}

// FNV-1a, enough to tell k-grams apart.
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

const k = 6; // tokens per k-gram
const w = 4; // winnowing window

// The winnowed fingerprints of an answer: the smallest hash in each window of k-gram hashes.
export function fingerprints(source: string, kind: SourceKind): Set<number> {
  const tokens = tokenize(source, kind);
  const hashes: number[] = [];
  for (let i = 0; i + k <= tokens.length; i++) hashes.push(hash(tokens.slice(i, i + k).join(" ")));
  const prints = new Set<number>();
  for (let i = 0; i + w <= hashes.length; i++) prints.add(Math.min(...hashes.slice(i, i + w)));
  if (hashes.length > 0 && hashes.length < w) prints.add(Math.min(...hashes));
  return prints;
}

// Too little original code to judge: a few lines on top of the starter look alike by chance.
const minPrints = 3;

export type SimilarPair = { a: string; b: string; score: number; shared: number };

// A passage this share of the class wrote (at least 3 students) is "the usual solution", not copying.
const commonShare = 0.3;

// Every pair of answers to one question whose fingerprints overlap at least `threshold` (0–1), highest first.
// The score is shared / the smaller answer's fingerprints, so copying part of a longer answer still shows.
// Starter code and passages most of the class wrote are ignored, as MOSS does.
export function similarPairs(
  answers: { id: string; text: string }[],
  starter: string,
  kind: SourceKind,
  threshold = 0.6,
): SimilarPair[] {
  const given = fingerprints(starter, kind);
  const all = answers.map(({ id, text }) => ({ id, set: fingerprints(text, kind) }));
  const count = new Map<number, number>();
  for (const { set } of all) for (const p of set) count.set(p, (count.get(p) ?? 0) + 1);
  const usual = Math.max(3, Math.ceil(answers.length * commonShare));
  const prints = all
    .map(({ id, set }) => ({ id, set: new Set([...set].filter((p) => !given.has(p) && (count.get(p) ?? 0) < usual)) }))
    .filter((x) => x.set.size >= minPrints);
  const pairs: SimilarPair[] = [];
  for (let i = 0; i < prints.length; i++)
    for (let j = i + 1; j < prints.length; j++) {
      const [small, large] = prints[i].set.size <= prints[j].set.size ? [prints[i].set, prints[j].set] : [prints[j].set, prints[i].set];
      let shared = 0;
      for (const p of small) if (large.has(p)) shared++;
      const score = shared / small.size;
      if (score >= threshold) pairs.push({ a: prints[i].id, b: prints[j].id, score, shared });
    }
  return pairs.sort((x, y) => y.score - x.score);
}

// Lines of `text` whose tokens also appear as a line in `other` (and not in the starter code),
// for highlighting in the side-by-side view.
export function matchingLines(text: string, other: string, starter: string, kind: SourceKind): Set<number> {
  const key = (line: string) => tokenize(line, kind).join(" ");
  const meaningful = (k: string) => k.split(" ").length >= 3;
  const given = new Set(starter.split("\n").map(key));
  const theirs = new Set(other.split("\n").map(key).filter((k) => meaningful(k) && !given.has(k)));
  const out = new Set<number>();
  text.split("\n").forEach((line, i) => {
    if (theirs.has(key(line))) out.add(i);
  });
  return out;
}
