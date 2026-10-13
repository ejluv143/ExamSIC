"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/select";

// "Alert type" dropdown in the table header; keeps the choice in the URL so it can be shared.
export function TypeFilter({ options }: { options: { value: string; label: string; count: number }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <Select
      aria-label="Filter by alert type"
      size="xs"
      triggerClassName="text-xs font-medium tracking-wide uppercase"
      value={params.get("type") ?? ""}
      onChange={(value) => {
        const next = new URLSearchParams(params);
        if (value) next.set("type", value);
        else next.delete("type");
        router.replace(`?${next}`, { scroll: false });
      }}
      options={[
        { value: "", label: "Alert type: all" },
        ...options.map((o) => ({ value: o.value, label: `${o.label} (${o.count})` })),
      ]}
    />
  );
}
