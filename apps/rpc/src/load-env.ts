// Import first in entry points: reads apps/rpc/.env when present. Real environment variables win.
// (`node --env-file-if-exists` crashes `node --watch` when the file is missing.)
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
