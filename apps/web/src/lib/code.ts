// Code questions: languages, and how a program's output is compared with the expected output.
import type { CodeLanguage, CodeQuestion, CodeTestResult } from "./types";

export const languageLabel: Record<CodeLanguage, string> = {
  python: "Python 3",
  java: "Java",
  cpp: "C++",
  c: "C",
  javascript: "JavaScript",
  php: "PHP 8.3",
};

// JavaScript and Python (Pyodide) run in the student's browser; the others run on the code runner (apps/runner).
export const runsInBrowser = (language: CodeLanguage) => language === "javascript" || language === "python";

export const starterTemplates: Record<CodeLanguage, string> = {
  python: "# Read input with input(), print the answer with print().\n",
  java: "import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        \n    }\n}\n",
  cpp: "#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n",
  c: "#include <stdio.h>\n\nint main(void) {\n    \n    return 0;\n}\n",
  javascript: "// Read a line with readline(), print with console.log().\n",
  php: "<?php\n\n$line = trim(fgets(STDIN));\n\n",
};

// PHP with tables: Laravel's database layer is ready, as in a Laravel app.
export const laravelStarter =
  "<?php\n\n// The tables are in a database you can query with Laravel:\n// DB::table('students')->where(...)->get(), DB::select(...), or Eloquent models.\n\n$input = trim(fgets(STDIN));\n\n";

// Trailing spaces on each line and blank lines at the end don't count, like most online judges.
const normalize = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd();

export const outputMatches = (actual: string, expected: string) => normalize(actual) === normalize(expected);

export function codeScore(q: CodeQuestion, results: CodeTestResult[]): number {
  if (q.tests.length === 0) return 0;
  const passed = q.tests.filter((t) => results.find((r) => r.testId === t.id)?.passed).length;
  return Math.round(((q.points * passed) / q.tests.length) * 100) / 100;
}
