"use client";

import { useState } from "react";
import type { Avatar } from "@examinus/domain/avatar";
import { AvatarEditor } from "@/components/avatar";
import { Card } from "@/components/ui";

export function AvatarForm({ initial }: { initial: Avatar }) {
  const [saved, setSaved] = useState(false);
  return (
    <Card className="max-w-3xl p-5">
      <AvatarEditor initial={initial} onSaved={() => setSaved(true)} />
      {saved && (
        <p role="status" className="animate-pop-in mt-3 text-sm font-medium text-primary">
          Saved. Your next game shows it.
        </p>
      )}
    </Card>
  );
}
