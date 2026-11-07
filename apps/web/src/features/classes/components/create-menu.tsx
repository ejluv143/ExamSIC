"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardCheck, ClipboardList, Megaphone, Plus, Shapes } from "lucide-react";
import type { PostKind } from "@examinus/domain/classes";
import { NewQuizButton } from "@/features/quiz/components/new-quiz-button";
import type { Class } from "../types";
import type { ClassFormState } from "../actions";
import { AnnouncementComposer } from "./announcements";

type Post = (prev: ClassFormState, formData: FormData) => Promise<ClassFormState>;

// Classroom's "+ Create": a pill button whose menu starts an announcement, assignment, activity or quiz. Without
// `post` (the Classwork tab, which has no composer) the menu only offers the quiz.
export function CreateMenu({ cls, post }: { cls: Class; post?: Post }) {
  const [menu, setMenu] = useState(false);
  const [composing, setComposing] = useState<PostKind | null>(null);
  const [quiz, setQuiz] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const item =
    "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none";

  return (
    <div className="space-y-4">
      <div ref={box} className="relative inline-block">
        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menu}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-md hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Plus className="size-5" aria-hidden /> Create
        </button>
        {menu && (
          <div
            role="menu"
            className="absolute top-full left-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface py-2 shadow-lg"
          >
            {post &&
              (
                [
                  ["announcement", "Announcement", Megaphone],
                  ["assignment", "Assignment", ClipboardCheck],
                  ["activity", "Activity", Shapes],
                ] as const
              ).map(([kind, label, Icon]) => (
                <button
                  key={kind}
                  role="menuitem"
                  type="button"
                  className={item}
                  onClick={() => {
                    setMenu(false);
                    setComposing(kind);
                  }}
                >
                  <Icon className="size-4 text-muted" aria-hidden /> {label}
                </button>
              ))}
            <button
              role="menuitem"
              type="button"
              className={item}
              onClick={() => {
                setMenu(false);
                setQuiz(true);
              }}
            >
              <ClipboardList className="size-4 text-muted" aria-hidden /> Quiz
            </button>
          </div>
        )}
      </div>

      {post && <AnnouncementComposer post={post} kind={composing} onClose={() => setComposing(null)} />}
      <NewQuizButton classes={[cls]} classId={cls.id} open={quiz} onOpenChange={setQuiz} hideTrigger />
    </div>
  );
}
