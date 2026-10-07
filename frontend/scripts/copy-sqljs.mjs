// Copies sql.js's Web Worker and WebAssembly file into public/, where the browser loads them for SQL questions.
// Runs before dev and build, so they always match the installed sql.js version.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const dist = path.dirname(createRequire(import.meta.url).resolve("sql.js"));
const out = path.join(import.meta.dirname, "..", "public", "sqljs");
mkdirSync(out, { recursive: true });
for (const file of ["worker.sql-wasm.js", "sql-wasm.wasm"]) copyFileSync(path.join(dist, file), path.join(out, file));
