// MCP server (stdio) that lets an AI client act as a signed-in Examinus teacher. See README.md.
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { registerAnalysis } from "./tools/analysis.ts";
import { registerCreating } from "./tools/creating.ts";
import { registerStudents } from "./tools/students.ts";

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

// stdout carries the protocol: anything else goes to stderr.
await server.connect(new StdioServerTransport());
console.error("examinus MCP server ready on stdio");
