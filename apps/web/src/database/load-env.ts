// Import first in scripts that run outside Next.js, so .env* files are read the same way Next.js reads them.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
