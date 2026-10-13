"use client";

import { Badge, inputClass } from "@/components/ui";
import type { InputProps } from "../views/input";

export function Input({ q, value, onChange }: InputProps<"enumeration">) {
  const given = Array.isArray(value) ? value : [];
  return (
        <div className="space-y-2">
          {Array.from({ length: q.itemCount }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 text-right text-sm text-muted">{i + 1}.</span>
              <input
                value={given[i] ?? ""}
                onChange={(e) => {
                  const next = [...given];
                  next[i] = e.target.value;
                  onChange(next);
                }}
                aria-label={`Item ${i + 1}`}
                className={inputClass}
              />
            </div>
          ))}
          {q.orderMatters && <Badge>Order matters</Badge>}
        </div>
  );
}
