import { Card } from "@/components/ui";

function Bar({ className }: { className: string }) {
  return <div className={`rounded-md bg-surface-muted ${className}`} />;
}

// The loading state inside the admin, teacher and student areas: the sidebar stays, and the page area shows
// the usual header, stat cards and a list while the page loads.
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="motion-safe:animate-pulse">
      <div className="mb-6">
        <Bar className="h-7 w-56" />
        <Bar className="mt-2 h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="p-5">
            <Bar className="h-4 w-24" />
            <Bar className="mt-3 h-8 w-16" />
          </Card>
        ))}
      </div>
      <Card className="mt-6">
        <div className="border-b border-border px-5 py-4">
          <Bar className="h-5 w-40" />
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-b-0">
            <Bar className="h-4 flex-1" />
            <Bar className="hidden h-4 w-24 sm:block" />
            <Bar className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </Card>
    </div>
  );
}
