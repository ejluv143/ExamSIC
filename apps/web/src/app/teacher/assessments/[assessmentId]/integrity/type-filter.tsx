"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { inputBase } from "@/components/ui";

// "Alert type" dropdown in the table header; keeps the choice in the URL so it can be shared.
export function TypeFilter({ options }: { options: { value: string; label: string; count: number }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <select
      aria-label="Filter by alert type"
      value={params.get("type") ?? ""}
      onChange={(e) => {
        const next = new URLSearchParams(params);
        if (e.target.value) next.set("type", e.target.value);
        else next.delete("type");
        router.replace(`?${next}`, { scroll: false });
      }}
      className={`${inputBase} py-1 text-xs font-medium tracking-wide uppercase`}
    >
      <option value="">Alert type: all</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label} ({o.count})
        </option>
      ))}
    </select>
  );
}
