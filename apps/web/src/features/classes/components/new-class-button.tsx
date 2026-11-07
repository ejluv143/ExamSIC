"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { createClassAction } from "../actions";
import { ClassForm } from "./class-form";

// "New class": a floating card with the class form instead of a page of its own. On Create the action sends the
// teacher to the new class. `tile` is the dashed "New class" tile that ends the class grid.
export function NewClassButton({ variant = "primary" }: { variant?: "primary" | "secondary" | "tile" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "tile" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="flex h-full min-h-48 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-5 text-sm font-medium text-muted transition-colors hover:border-primary hover:bg-primary-soft/40 hover:text-primary"
        >
          <span className="grid size-10 place-items-center rounded-full bg-surface-muted">
            <Plus className="size-5" aria-hidden />
          </span>
          New class
        </button>
      ) : (
        <Button variant={variant} onClick={() => setOpen(true)} aria-haspopup="dialog">
          <Plus className="size-4" aria-hidden /> New class
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New class"
        description="You get a class code to share; students join with it."
        size="lg"
      >
        <ClassForm action={createClassAction} onCancel={() => setOpen(false)} submitLabel="Create class" />
      </Dialog>
    </>
  );
}
