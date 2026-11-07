"use client";

import { useActionState, useRef } from "react";
import { Trash2 } from "lucide-react";
import type { PostKind } from "@examinus/domain/classes";
import { Button } from "@/components/ui";
import type { ClassFormState } from "../actions";

type Post = (prev: ClassFormState, formData: FormData) => Promise<ClassFormState>;

const copy = {
  announcement: { heading: "New announcement", placeholder: "Announce something to your class", submit: "Post" },
  assignment: { heading: "New assignment", placeholder: "Instructions (optional)", submit: "Assign" },
  activity: { heading: "New activity", placeholder: "Instructions (optional)", submit: "Post" },
} satisfies Record<PostKind, { heading: string; placeholder: string; submit: string }>;

// The box the "Create" menu opens to write an announcement, assignment or activity; `kind` null keeps it closed.
export function AnnouncementComposer({
  post,
  kind,
  onClose,
}: {
  post: Post;
  kind: PostKind | null;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ClassFormState, FormData>(async (prev, formData) => {
    const result = await post(prev, formData);
    if (!result) {
      formRef.current?.reset();
      onClose();
    }
    return result;
  }, undefined);

  if (!kind) return null;
  const text = copy[kind];
  const announcement = kind === "announcement";
  const field =
    "w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm focus:outline-2 focus:outline-primary";

  return (
    <form ref={formRef} key={kind} action={action} className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <input type="hidden" name="kind" value={kind} />
      <p className="font-medium">{text.heading}</p>
      {!announcement && (
        <div>
          <label htmlFor="post-title" className="mb-1 block text-sm text-muted">
            Title
          </label>
          <input id="post-title" name="title" required maxLength={150} autoFocus className={field} />
        </div>
      )}
      <div>
        <label htmlFor="post-body" className="mb-1 block text-sm text-muted">
          {announcement ? "Announcement" : "Instructions"}
        </label>
        <textarea
          id="post-body"
          name="body"
          rows={announcement ? 4 : 3}
          maxLength={5000}
          required={announcement}
          autoFocus={announcement}
          placeholder={text.placeholder}
          className={`${field} resize-y`}
        />
      </div>
      {!announcement && (
        <div>
          <label htmlFor="post-due" className="mb-1 block text-sm text-muted">
            Due (optional)
          </label>
          <input id="post-due" name="dueAt" type="datetime-local" className={field} />
        </div>
      )}
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Posting…" : text.submit}
        </Button>
      </div>
    </form>
  );
}

export function DeleteAnnouncementButton({ remove }: { remove: () => Promise<ClassFormState> }) {
  const [state, action, pending] = useActionState(remove, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Delete this announcement?")) e.preventDefault();
      }}
    >
      <Button type="submit" variant="ghost" className="px-2 py-1" disabled={pending} aria-label="Delete announcement">
        <Trash2 className="size-4" aria-hidden />
      </Button>
      {state?.error && (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}
