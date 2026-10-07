// Code questions: languages and starter code.
import type { CodeLanguage } from "@examora/contract";

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
