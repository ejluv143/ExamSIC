// How a quiz's questions are laid out as the printed paper's parts: one part per question type, in a fixed
// order, with the school's default headings and instructions.
import type { Question, QuestionType } from "@examora/contract";
import type { PartSettings } from "./types";

export const defaultParts: Record<QuestionType, PartSettings> = {
  multiple_choice: {
    title: "Multiple Choice",
    instructions: "Read each item carefully and encircle the letter corresponding to the correct answer.",
  },
  true_false: {
    title: "True or False",
    instructions:
      "Write TRUE if the statement is correct and FALSE if it is not. Write your answer on the space provided before each number.",
  },
  identification: {
    title: "Identification",
    instructions:
      "Identify the term, concept, or formula described in each statement. Write your answer on the space provided before each number.",
  },
  fill_in_the_blank: {
    title: "Fill in the Blanks",
    instructions: "Fill in each blank with the correct word or phrase.",
  },
  enumeration: { title: "Enumeration", instructions: "List what is asked in each item." },
  numeric: {
    title: "Problem Solving",
    instructions: "Solve each problem. Write your final answer on the space provided before each number.",
  },
  essay: { title: "Essay", instructions: "Answer each question briefly but completely." },
  sql: {
    title: "SQL",
    instructions: "Write one SELECT query for each problem using the tables given.",
  },
  code: {
    title: "Programming",
    instructions:
      "Write a complete program for each problem. Your program reads the input and prints the output exactly as shown.",
  },
};

// Instructions when students answer on the separate answer sheet.
const sheetInstructions: Record<QuestionType, string> = {
  multiple_choice: "Read each item carefully and shade the letter of the correct answer on your answer sheet.",
  true_false: "Shade T if the statement is correct and F if it is not on your answer sheet.",
  identification:
    "Identify the term, concept, or formula described in each statement. Write your answer on your answer sheet.",
  fill_in_the_blank: "Write the missing word or phrase for each blank on your answer sheet.",
  enumeration: "List what is asked in each item on your answer sheet.",
  numeric: "Solve each problem. Write your final answer on your answer sheet.",
  essay: "Answer each question on your answer sheet.",
  code: "Write each program on your answer sheet.",
  sql: "Write each query on your answer sheet.",
};

export function defaultPart(type: QuestionType, answerSheet: boolean): PartSettings {
  return answerSheet ? { ...defaultParts[type], instructions: sheetInstructions[type] } : defaultParts[type];
}

// Parts always print in this order, whatever order the questions were added in.
export const partOrder: QuestionType[] = [
  "multiple_choice",
  "true_false",
  "identification",
  "fill_in_the_blank",
  "enumeration",
  "numeric",
  "essay",
  "sql",
  "code",
];

// Each question type becomes one part. Within a part, questions keep their editor order; numbering restarts per part.
export function groupIntoParts(questions: Question[]) {
  return partOrder
    .map((type) => ({ type, questions: questions.filter((q) => q.type === type) }))
    .filter((part) => part.questions.length > 0);
}
