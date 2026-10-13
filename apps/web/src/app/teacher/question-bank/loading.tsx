import { Card } from "@/components/ui";

function Bar({ className }: { className: string }) {
  return <div className={`rounded-md bg-surface-muted ${className}`} />;
}

// The question bank while it loads: the header, the counts, the toolbar and a few question rows.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading the question bank" className="motion-safe:animate-pulse">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Bar className="h-7 w-48" />
          <Bar className="mt-2 h-4 w-96 max-w-full" />
        </div>
        <Bar className="h-9 w-72 max-w-full" />
      </div>
      <Card className="mb-6 grid gap-px overflow-hidden bg-border sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 bg-surface px-5 py-4">
            <Bar className="size-10 rounded-xl" />
            <div>
              <Bar className="h-6 w-10" />
              <Bar className="mt-2 h-3 w-24" />
            </div>
          </div>
        ))}
      </Card>
      <Bar className="mb-3 h-9 w-full" />
      <Bar className="mb-5 h-8 w-2/3" />
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Card key={i} className="p-3">
            <Bar className="h-5 w-48" />
            <Bar className="mt-2 h-4 w-3/4" />
          </Card>
        ))}
      </div>
    </div>
  );
}
