"use client";

import { createContext } from "react";

// The topics the teacher already uses (from the question bank), suggested in the question editor's topic field. In a
// module of its own so the pages that provide it don't load the question editor to do so.
export const EditorTopics = createContext<readonly string[]>([]);
