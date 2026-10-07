import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/server";

// Better Auth's HTTP endpoints, including the Google OAuth callback.
export const { GET, POST } = toNextJsHandler(auth);
