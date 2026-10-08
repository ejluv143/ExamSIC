"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui";
import { OnlineExam } from "@/components/online-exam";
import type { Assessment, Class } from "@/lib/types";
import { Segmented } from "./segmented";

// A button that opens the exam as students see it when they take it in Examinus.
export function OnlinePreview({ assessment: a, classes }: { assessment: Assessment; classes: Class[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");

  return (
    <>
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        <Eye className="size-4" aria-hidden /> Preview online exam
      </Button>
      <dialog
        ref={dialog}
        aria-label="Online exam preview"
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
        onClose={() => setOpen(false)}
        className="m-auto h-[calc(100dvh-2rem)] w-[min(62rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-xl bg-surface-muted p-0 text-foreground shadow-xl backdrop:bg-black/50"
      >
        <div className="flex h-full flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-5 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-semibold">Online preview</h2>
              <Segmented
                label="Screen size"
                value={device}
                options={[
                  ["desktop", "Computer"],
                  ["phone", "Phone"],
                ]}
                onChange={setDevice}
              />
            </div>
            <Button variant="ghost" className="px-2" aria-label="Close preview" onClick={() => dialog.current?.close()}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-3 sm:p-6">
            {open && (
              <div
                className={clsx(
                  "mx-auto bg-background",
                  device === "phone"
                    ? "min-h-full w-[390px] max-w-full rounded-2xl border-8 border-neutral-800 p-3"
                    : "rounded-xl p-3 sm:p-6",
                )}
              >
                <p className="mb-3 text-center text-xs text-muted">
                  What students see when they take it in Examinus. Answers aren&apos;t saved.
                </p>
                {/* Sized by its frame, so the phone preview lays out like a real phone. */}
                <div className="@container">
                  <OnlineExam assessment={a} classes={classes} />
                </div>
              </div>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
