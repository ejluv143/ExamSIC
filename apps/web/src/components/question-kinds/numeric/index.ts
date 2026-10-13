import type { QuestionUi } from "../types";
import { Editor } from "./editor";
import { Input } from "./input";
import { Print, traits as printTraits } from "./print";
import { Review } from "./review";

export const ui: QuestionUi<"numeric"> = { Input, Review, Editor, Print, printTraits };
