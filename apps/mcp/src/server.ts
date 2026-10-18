// The Examinus MCP server: one fresh instance per stdio connection or per HTTP request, same tools for both.
import { McpServer } from "@modelcontextprotocol/server";
import { registerAnalysis } from "./tools/analysis.ts";
import { registerCreating } from "./tools/creating.ts";
import { registerStudents } from "./tools/students.ts";

export function createServer() {
  const server = new McpServer(
    { name: "examinus", version: "0.1.0" },
    {
      instructions:
        "Acts as a signed-in Examinus teacher. Create quizzes and questions (start with question_shapes), analyse sessions (list_sessions, session_results, question_analysis, integrity_summary) and report on classes and students (class_overview, student_report).",
    },
  );
  registerCreating(server);
  registerAnalysis(server);
  registerStudents(server);
  return server;
}
